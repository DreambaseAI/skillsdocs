import {
  DEFAULT_PREFS,
  LIMITS,
  PAPER_MODES,
  PREFS_COOKIE,
  SIZE_STEPS,
} from "@/lib/reader/prefs";

/**
 * Applies saved reading preferences to `<html>` before the first paint.
 *
 * Why a blocking inline script rather than reading the cookie in a Server
 * Component: `cookies()` in the root layout opts every route out of
 * prerendering under `cacheComponents`, so the entire site would become
 * dynamic — and the HTML would vary per reader, which forfeits CDN caching —
 * purely to set a few attributes. This script runs synchronously in `<head>`,
 * before anything is painted, so there is still no flash of default
 * typography, and the served HTML stays identical for everyone.
 *
 * The trade-off is that readers with JavaScript disabled get the defaults.
 * That is the correct thing to lose: the defaults are a good reading
 * experience, and the alternative costs every reader a dynamic render.
 *
 * The script is generated from the same constants the codec uses, so the two
 * cannot drift.
 */
export function ReaderPrefsScript() {
  const script = `(function(){try{
var C=${JSON.stringify(PREFS_COOKIE)},D=${JSON.stringify(DEFAULT_PREFS)},
S=${JSON.stringify(SIZE_STEPS)},L=${JSON.stringify(LIMITS)},P=${JSON.stringify(PAPER_MODES)};
var m=document.cookie.match(new RegExp('(?:^|; )'+C+'=([^;]*)'));
if(!m)return;
var q=new URLSearchParams(decodeURIComponent(m[1])),e=document.documentElement;
function n(k,d,lo,hi){var v=q.get(k);if(v===null)return d;v=Number(v);
return isFinite(v)?Math.min(hi,Math.max(lo,v)):d}
function s(k,d,allow){var v=q.get(k);return v&&allow.indexOf(v)>-1?v:d}
function id(k,d){var v=q.get(k);return v&&/^[a-z0-9-]{1,32}$/.test(v)?v:d}
var font=id('f',D.font),code=id('cf',D.codeFont),
si=Math.round(n('s',D.sizeIndex,0,S.length-1)),
lhRaw=q.get('lh'),
lh=lhRaw===null?D.lineHeight:(lhRaw==='a'||lhRaw==='null')?null:
Math.min(L.lineHeight.max,Math.max(L.lineHeight.min,Number(lhRaw))),
cpl=Math.round(n('m',D.cpl,L.cpl.min,L.cpl.max)),
tr=n('t',D.tracking,L.tracking.min,L.tracking.max),
ws=n('w',D.wordSpacing,L.wordSpacing.min,L.wordSpacing.max),
pg=n('pg',D.paraGap,L.paraGap.min,L.paraGap.max),
ps=s('ps',D.paraStyle,['spaced','indented']),
al=s('al',D.align,['left','justify']),
pa=s('pa',D.paper,P),
ct=s('c',D.contrast,['normal','high']),
mo=s('mo',D.motion,['system','reduce','allow']);
e.setAttribute('data-reader-font',font);
e.setAttribute('data-reader-code-font',code);
e.setAttribute('data-reader-lh',lh===null?'auto':'manual');
e.setAttribute('data-reader-para',ps);
e.setAttribute('data-reader-align',al);
e.setAttribute('data-contrast',ct);
if(pa!=='system')e.setAttribute('data-paper',pa);
if(mo!=='system')e.setAttribute('data-motion',mo);
var st=e.style;
st.setProperty('--reader-size-step',S[si]+'px');
st.setProperty('--reader-measure-cpl',String(cpl));
st.setProperty('--reader-tracking',tr+'em');
st.setProperty('--reader-word-spacing',ws+'em');
st.setProperty('--reader-para-gap',pg+'em');
st.setProperty('--reader-align',al);
st.setProperty('--reader-para-indent',ps==='indented'?'1.5em':'0em');
if(lh!==null)st.setProperty('--reader-lh-manual',String(lh));
}catch(_){}})()`;

  return (
    <script
      // Generated from our own constants; contains no user-controlled string.
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}
