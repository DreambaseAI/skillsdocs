import { describe, expect, it } from "vitest";

import { sharedLead } from "./rail-left";

/**
 * `microsoft/azure-skills` puts 30 consecutive entries in the contents rail
 * whose first six characters are `Azure ` — `Azure AI`, `Azure Aigateway`,
 * `Azure App Onboard Prereq`, … The rail is unscannable: nothing distinguishes
 * one entry from the next until character seven.
 */

const AZURE = [
  "Azure AI",
  "Azure Aigateway",
  "Azure App Onboard Prereq",
  "Azure Bicep",
  "Azure Cosmos DB",
  "Azure Functions",
  "Deployment Guide",
];

describe("sharedLead", () => {
  it("finds the headword a clear majority of a part shares", () => {
    expect(sharedLead(AZURE)).toBe("Azure");
  });

  it("says nothing when the list is short enough to scan as it is", () => {
    expect(sharedLead(AZURE.slice(0, 4))).toBeNull();
  });

  it("says nothing below a 60% majority", () => {
    expect(
      sharedLead(["Azure AI", "Azure Bicep", "Slack GIF", "PDF", "Docx", "Xlsx"]),
    ).toBeNull();
  });

  it("refuses a headword that would leave an entry with no label at all", () => {
    expect(
      sharedLead(["Azure", "Azure AI", "Azure Bicep", "Azure Functions", "Azure Cosmos"]),
    ).toBeNull();
  });

  it("refuses a headword too short to be worth removing", () => {
    expect(sharedLead(["Go Build", "Go Test", "Go Vet", "Go Fmt", "Go Run"])).toBeNull();
  });
});
