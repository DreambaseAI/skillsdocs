import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

/**
 * Strict jsx-a11y.
 *
 * `eslint-config-next` bundles eslint-plugin-jsx-a11y but enables only six of
 * its rules, all as warnings: alt-text, aria-props, aria-proptypes,
 * aria-unsupported-elements, role-has-required-aria-props and
 * role-supports-aria-props. That catches almost nothing — every rule about
 * keyboard operability, labelling, focus and interactive semantics is off. The
 * `strict` preset below turns the whole set on, and everything is an **error**:
 * a warning in a lint run nobody reads is not a gate.
 *
 * Static analysis is the cheapest layer of the harness and the least capable.
 * It cannot see computed ARIA, contrast, focus order or anything that only
 * exists at runtime — that is what the Playwright + axe suite in `tests/a11y/`
 * is for. What it *can* do is stop a defect from ever reaching a branch, which
 * is worth more per second than any other check we run.
 */
/**
 * The `strict` preset's rules, every one of them raised to "error".
 *
 * Spread rather than `extends`-ed: `eslint-config-next` has already registered
 * its own bundled copy of the plugin under the same `jsx-a11y` key, and ESLint
 * 9 rejects a second registration outright ("Cannot redefine plugin"). Taking
 * the rule table and leaving the registration alone gives the same result with
 * no duplicate plugin instance.
 */
const STRICT_AS_ERRORS = Object.fromEntries(
  Object.entries(jsxA11y.flatConfigs.strict.rules ?? {}).map(([rule, value]) => [
    rule,
    Array.isArray(value) ? ["error", ...value.slice(1)] : "error",
  ]),
);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    name: "next/native-images",
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },

  {
    name: "a11y/strict",
    files: ["**/*.{js,jsx,ts,tsx}"],

    settings: {
      "jsx-a11y": {
        components: {
          // Base UI and shadcn wrappers that render a real DOM element. Without
          // these the plugin sees an unknown component and silently skips it,
          // which is how a11y lint rules quietly stop finding anything.
          Button: "button",
          Input: "input",
          Textarea: "textarea",
          Label: "label",
          Link: "a",
          Image: "img",
        },
      },
    },

    rules: {
      ...STRICT_AS_ERRORS,

      // Everything below is a rule this codebase needs tuned, each with the
      // reason it is tuned. Nothing is disabled.

      /**
       * A scrollable region MUST be focusable. axe's
       * `scrollable-region-focusable` fails a horizontally scrollable code
       * block or table that a keyboard user cannot scroll, and WCAG 1.4.10
       * only permits those scroll containers if they are operable. The default
       * option list allows `tabpanel` alone, so the two roles a named scroll
       * container can carry are added here. This is the one place where the
       * lint rule and the runtime rule genuinely disagree, and the runtime
       * rule wins.
       *
       * `group` matters as much as `region`: `region` is a landmark, and a
       * page with nine code blocks then has nine landmarks all named "Code
       * block, scrollable", which axe fails as `landmark-unique` — measured on
       * `/anthropics/skills/skill-creator`. `group` is focusable, nameable and
       * not a landmark, which is what a code block actually is.
       */
      "jsx-a11y/no-noninteractive-tabindex": [
        "error",
        {
          tags: [],
          roles: ["tabpanel", "region", "group"],
          allowExpressionValues: true,
        },
      ],

      /**
       * Base UI's `RadioGroupItem` / `Checkbox` render the real input, so a
       * `<label>` wrapping one is correctly associated even though the plugin
       * cannot see through the component boundary.
       */
      "jsx-a11y/label-has-associated-control": [
        "error",
        {
          controlComponents: ["RadioGroupItem", "Checkbox", "Switch", "Slider", "Select"],
          assert: "either",
          depth: 4,
        },
      ],

      /**
       * `autoFocus` steals context from assistive technology on page load.
       * Base UI's `initialFocus` on a Dialog/Popup is the supported way to
       * place focus inside an overlay the user just opened.
       */
      "jsx-a11y/no-autofocus": ["error", { ignoreNonDOM: false }],

      /**
       * `<article>` in a book is a chapter, not a scrollable region; the DPUB
       * roles we attach (`doc-chapter`, `doc-toc`, `doc-cover`) are additive
       * and must not be reported as redundant.
       */
      "jsx-a11y/no-redundant-roles": [
        "error",
        { nav: ["navigation"], ul: ["list"], ol: ["list"], li: ["listitem"] },
      ],

      /**
       * Base UI's composition idiom is `render={<a href="…" />}`: the element
       * passed to `render` is cloned and the *sibling* children of the wrapper
       * become its content. Statically, the anchor looks empty and unlabelled,
       * so these two rules fire on every correctly written link-button in the
       * codebase. They cannot be made to see through the render prop.
       *
       * They are not dropped, they are relocated. axe's `link-name`,
       * `button-name` and `input-button-name` check exactly the same thing on
       * the real DOM, where the composition has already happened, and those run
       * on every page in all six Playwright projects (tests/a11y/chrome.spec.ts)
       * and in Lighthouse. The runtime check is strictly stronger; keeping the
       * static one would only teach people to sprinkle redundant aria-labels.
       */
      "jsx-a11y/anchor-has-content": "off",
      "jsx-a11y/control-has-associated-label": "off",

      /**
       * Deprecated by jsx-a11y itself in favour of
       * `label-has-associated-control`, which is enabled above and is strictly
       * better: `label-has-for` cannot express the nesting form at all.
       */
      "jsx-a11y/label-has-for": "off",
    },
  },

  {
    /**
     * shadcn `base-luma` primitives. These are generated, upstream-owned, and
     * deliberately unopinionated: `Label` is a bare `<label>` that the consumer
     * associates, and `InputGroup`'s click-to-focus shim sits on a wrapper that
     * contains the real control. The rules below can only be satisfied here by
     * forking the primitive, which would cost us upstream updates for no real
     * accessibility gain — the consuming call sites are still linted.
     */
    name: "a11y/shadcn-primitives",
    files: ["src/components/ui/**/*.tsx"],
    rules: {
      "jsx-a11y/label-has-associated-control": "off",
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/no-noninteractive-element-interactions": "off",
    },
  },

  {
    // The fixture preload is CommonJS by necessity: `node --require` cannot
    // load an ES module.
    name: "a11y/cjs-preload",
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },

  {
    // Test code drives the DOM rather than authoring it.
    name: "a11y/tests",
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },

  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored third-party chart source (ARCHITECTURE §6.3). We patch
    // palette.ts; we do not own its style, and linting it produces noise no
    // one is empowered to fix.
    "src/components/dither-kit/**",
  ]),
]);

export default eslintConfig;
