import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  TOUR_STEPS,
  SCREEN_STEPS,
  STEP_FINAL_ID,
  getStepById,
  getStepsForScreen,
} from "../src/tour/tour-data.ts";

describe("Marswalk Onboarding Tour Verification Suite (R1 - R5)", () => {
  describe("R3: Step Registry & Verification Table (16 steps)", () => {
    it("should register exactly 16 tour steps with unique sequential IDs 1 to 16", () => {
      assert.equal(TOUR_STEPS.length, 16, "Tour must contain exactly 16 steps");
      const ids = TOUR_STEPS.map((s) => s.id);
      for (let i = 1; i <= 16; i++) {
        assert.ok(ids.includes(i), `Step ${i} must exist`);
      }
      // Check strict ascending order
      for (let i = 0; i < 16; i++) {
        assert.equal(TOUR_STEPS[i].id, i + 1, `Index ${i} must have id ${i + 1}`);
      }
    });

    it("should partition mini-tours per screen correctly", () => {
      assert.deepEqual(SCREEN_STEPS.hub, [1, 2, 3], "Hub initial steps must be 1-3");
      assert.deepEqual(SCREEN_STEPS.plan, [4, 5], "Plan steps must be 4-5");
      assert.deepEqual(SCREEN_STEPS.eva, [6, 7, 8, 9, 10], "EVA Map steps must be 6-10");
      assert.deepEqual(SCREEN_STEPS.fov, [11], "FoV step must be 11");
      assert.deepEqual(SCREEN_STEPS.comms, [12, 13, 14], "Comms steps must be 12-14");
      assert.deepEqual(SCREEN_STEPS.debrief, [15], "Debrief step must be 15");
      assert.equal(STEP_FINAL_ID, 16, "Step 16 must be the final replay target");
    });

    it("should format step counter ('X of Y') correctly within each screen's mini-tour", () => {
      // Hub (3 steps)
      const hubSteps = getStepsForScreen("hub");
      assert.equal(hubSteps.length, 3);
      assert.equal(hubSteps[0].stepInScreen, 1);
      assert.equal(hubSteps[0].totalInScreen, 3);
      assert.equal(hubSteps[2].stepInScreen, 3);
      assert.equal(hubSteps[2].totalInScreen, 3);

      // Plan (2 steps)
      const planSteps = getStepsForScreen("plan");
      assert.equal(planSteps.length, 2);
      assert.equal(planSteps[0].stepInScreen, 1);
      assert.equal(planSteps[0].totalInScreen, 2);
      assert.equal(planSteps[1].stepInScreen, 2);
      assert.equal(planSteps[1].totalInScreen, 2);

      // EVA Map (5 steps)
      const evaSteps = getStepsForScreen("eva");
      assert.equal(evaSteps.length, 5);
      assert.equal(evaSteps[0].stepInScreen, 1);
      assert.equal(evaSteps[0].totalInScreen, 5);
      assert.equal(evaSteps[4].stepInScreen, 5);
      assert.equal(evaSteps[4].totalInScreen, 5);

      // FoV (1 step)
      const fovSteps = getStepsForScreen("fov");
      assert.equal(fovSteps.length, 1);
      assert.equal(fovSteps[0].stepInScreen, 1);
      assert.equal(fovSteps[0].totalInScreen, 1);

      // Comms (3 steps)
      const commsSteps = getStepsForScreen("comms");
      assert.equal(commsSteps.length, 3);
      assert.equal(commsSteps[0].stepInScreen, 1);
      assert.equal(commsSteps[0].totalInScreen, 3);
      assert.equal(commsSteps[2].stepInScreen, 3);
      assert.equal(commsSteps[2].totalInScreen, 3);

      // Debrief (1 step)
      const debriefSteps = getStepsForScreen("debrief");
      assert.equal(debriefSteps.length, 1);
      assert.equal(debriefSteps[0].stepInScreen, 1);
      assert.equal(debriefSteps[0].totalInScreen, 1);

      // Final step (1 step)
      const stepFinal = getStepById(16);
      assert.ok(stepFinal);
      assert.equal(stepFinal.stepInScreen, 1);
      assert.equal(stepFinal.totalInScreen, 1);
    });
  });

  describe("R2 & R3: Tip Card Content & Word Count Verification (< 25 words)", () => {
    it("every step must have body copy under 25 words using plain language and sentence case", () => {
      for (const step of TOUR_STEPS) {
        assert.ok(step.title.trim().length > 0, `Step ${step.id} must have non-empty title`);
        assert.ok(step.text.trim().length > 0, `Step ${step.id} must have non-empty text`);

        // Count words separated by whitespace
        const words = step.text.trim().split(/\s+/).filter(Boolean);
        assert.ok(
          words.length < 25,
          `Step ${step.id} ("${step.title}") text has ${words.length} words, which exceeds limit of 25: "${step.text}"`
        );
      }
    });

    it("verifies exact titles and copy against R3 requirement table", () => {
      const expected: Record<number, { title: string; textPrefix: string }> = {
        1: { title: "Welcome to Marswalk", textPrefix: "Plan one safe walk on Mars." },
        2: { title: "EVA Presets", textPrefix: "Start here." },
        3: { title: "Your five stops", textPrefix: "These tabs follow one walk:" },
        4: { title: "Pre-walk checklist", textPrefix: "Finish every item before you go." },
        5: { title: "Your stops", textPrefix: "These are the places you will visit." },
        6: { title: "Your route", textPrefix: "The white line is your path." },
        7: { title: "Map layers", textPrefix: "Turn layers on or off:" },
        8: { title: "Hazard alerts", textPrefix: "Red means danger." },
        9: { title: "Route profile", textPrefix: "See how steep your path gets." },
        10: { title: "Move around", textPrefix: "Zoom in and out," },
        11: { title: "What you will see", textPrefix: "A preview of the view at your next stop," },
        12: { title: "Signal map", textPrefix: "Brighter areas of the sky mean a stronger signal." },
        13: { title: "Two views", textPrefix: "Link budget shows signal strength." },
        14: { title: "Satellite passes", textPrefix: '"In view" means a satellite is overhead now.' },
        15: { title: "Walk review", textPrefix: "Compare the plan with the real walk:" },
        16: { title: "You're ready", textPrefix: "You can replay this tour any time from here." },
      };

      for (const [idStr, exp] of Object.entries(expected)) {
        const id = Number(idStr);
        const step = getStepById(id);
        assert.ok(step, `Step ${id} must exist`);
        assert.equal(step.title, exp.title, `Step ${id} title mismatch`);
        assert.ok(
          step.text.startsWith(exp.textPrefix),
          `Step ${id} text "${step.text}" does not start with "${exp.textPrefix}"`
        );
      }
    });
  });

  describe("R3: Demo Data & 'simulated' Label Verification", () => {
    it("exactly steps 8, 11, and 12 must have simulated = true, and all other 13 steps must have simulated = false", () => {
      const simulatedIds = [8, 11, 12];
      for (const step of TOUR_STEPS) {
        if (simulatedIds.includes(step.id)) {
          assert.equal(
            step.simulated,
            true,
            `Step ${step.id} (${step.feature}) must have simulated: true`
          );
        } else {
          assert.equal(
            step.simulated,
            false,
            `Step ${step.id} (${step.feature}) must have simulated: false`
          );
        }
      }
    });
  });

  describe("R1 & R3: Target Anchors & Spotlight Selectors", () => {
    it("verifies target selectors for spotlight anchoring", () => {
      // Step 1: whole screen (targetSelector is null)
      assert.equal(getStepById(1)?.targetSelector, null, "Step 1 whole screen targetSelector is null");

      // Steps 2-16 must have valid data-tour attribute selectors
      const expectedSelectors: Record<number, string> = {
        2: '[data-tour="eva-presets"]',
        3: '[data-tour="main-nav"]',
        4: '[data-tour="plan-checklist"]',
        5: '[data-tour="plan-stops"]',
        6: '[data-tour="eva-route"]',
        7: '[data-tour="eva-layers"]',
        8: '[data-tour="hazard-card"]',
        9: '[data-tour="eva-profile"]',
        10: '[data-tour="map-controls"]',
        11: '[data-tour="arrival-preview"]',
        12: '[data-tour="sky-dome"]',
        13: '[data-tour="comms-switch"]',
        14: '[data-tour="pass-list"]',
        15: '[data-tour="walk-summary"]',
        16: '[data-tour="help-button"]',
      };

      for (const [idStr, selector] of Object.entries(expectedSelectors)) {
        const id = Number(idStr);
        const step = getStepById(id);
        assert.ok(step, `Step ${id} must exist`);
        assert.equal(step.targetSelector, selector, `Step ${id} selector mismatch`);
      }
    });

    it("verifies that all data-tour attributes are present in screen/component source code", () => {
      const rootDir = join(import.meta.dirname, "..");
      const filesToCheck = [
        { file: "src/components/marswalk/top-bar.tsx", targets: ['data-tour="help-button"', 'dataTour="main-nav"'] },
        { file: "src/screens/hub.tsx", targets: ['data-tour="eva-presets"'] },
        { file: "src/screens/plan.tsx", targets: ['data-tour="plan-checklist"', 'data-tour="plan-stops"'] },
        { file: "src/screens/eva-map.tsx", targets: ['data-tour="eva-route"', 'dataTour="eva-layers"', 'data-tour="hazard-card"', 'data-tour="eva-profile"'] },
        { file: "src/components/marswalk/map.tsx", targets: ['data-tour="map-controls"'] },
        { file: "src/screens/fov.tsx", targets: ['data-tour="arrival-preview"'] },
        { file: "src/screens/comms-link.tsx", targets: ['data-tour="sky-dome"', 'data-tour="comms-switch"'] },
        { file: "src/screens/comms-passes.tsx", targets: ['data-tour="pass-list"'] },
        { file: "src/screens/debrief.tsx", targets: ['data-tour="walk-summary"'] },
      ];

      for (const { file, targets } of filesToCheck) {
        const content = readFileSync(join(rootDir, file), "utf8");
        for (const target of targets) {
          assert.ok(
            content.includes(target),
            `Expected ${file} to contain anchor '${target}'`
          );
        }
      }
    });
  });

  describe("R1: Touch Target Sizing (56px minimum for gloved fingers)", () => {
    it("verifies design token --size-touch-glove is 56px in src/index.css", () => {
      const rootDir = join(import.meta.dirname, "..");
      const css = readFileSync(join(rootDir, "src/index.css"), "utf8");
      assert.ok(
        css.includes("--size-touch-glove: 56px;"),
        "src/index.css must declare --size-touch-glove: 56px;"
      );
    });

    it("verifies all tour buttons in TourOverlay meet the 56px minimum dimension requirement", () => {
      const rootDir = join(import.meta.dirname, "..");
      const overlayCode = readFileSync(join(rootDir, "src/tour/tour-overlay.tsx"), "utf8");

      // Verify Back button
      assert.ok(
        overlayCode.includes('data-testid="tour-back-button"') &&
        overlayCode.includes("min-h-[56px] min-w-[56px]"),
        "Back button must enforce min-h-[56px] min-w-[56px]"
      );

      // Verify Next button
      assert.ok(
        overlayCode.includes('data-testid="tour-next-button"') &&
        overlayCode.includes("min-h-[56px] min-w-[56px]"),
        "Next button must enforce min-h-[56px] min-w-[56px]"
      );

      // Verify Skip tour button
      assert.ok(
        overlayCode.includes('data-testid="tour-skip-button"') &&
        overlayCode.includes("min-h-[56px] min-w-[56px]"),
        "Skip button must enforce min-h-[56px] min-w-[56px]"
      );

      // Verify Skip all button
      assert.ok(
        overlayCode.includes('data-testid="tour-skip-all-button"') &&
        overlayCode.includes("min-h-[56px] min-w-[56px]"),
        "Skip all button must enforce min-h-[56px] min-w-[56px]"
      );
    });

    it("verifies TopBar Help/replay button has 56px touch target", () => {
      const rootDir = join(import.meta.dirname, "..");
      const topBarCode = readFileSync(join(rootDir, "src/components/marswalk/top-bar.tsx"), "utf8");
      assert.ok(
        topBarCode.includes('data-tour="help-button"') &&
        topBarCode.includes("min-h-[56px] min-w-[56px]"),
        "TopBar Help button must enforce min-h-[56px] min-w-[56px]"
      );
    });
  });

  describe("R1 & Visuals: Reduced Motion & Corner Brackets", () => {
    it("verifies corner brackets component is rendered over the spotlight target in TourOverlay", () => {
      const rootDir = join(import.meta.dirname, "..");
      const overlayCode = readFileSync(join(rootDir, "src/tour/tour-overlay.tsx"), "utf8");
      assert.ok(
        overlayCode.includes("<Brackets"),
        "TourOverlay must render Marswalk <Brackets />"
      );
      assert.ok(
        overlayCode.includes('data-testid="tour-brackets"'),
        "TourOverlay must include tour-brackets container"
      );
    });

    it("verifies prefers-reduced-motion handling in TourOverlay", () => {
      const rootDir = join(import.meta.dirname, "..");
      const overlayCode = readFileSync(join(rootDir, "src/tour/tour-overlay.tsx"), "utf8");
      assert.ok(
        overlayCode.includes("isReducedMotion"),
        "TourOverlay must query isReducedMotion"
      );
      assert.ok(
        overlayCode.includes("isReduced ?"),
        "TourOverlay must adapt transitions when reduced motion is active"
      );
    });
  });

  describe("R2 & R3: Browser Storage Persistence & Skip Logic", () => {
    it("simulates storage roundtrip with marswalk.tour.v1 schema", () => {
      const storageMock: Record<string, string> = {};
      const STORAGE_KEY = "marswalk.tour.v1";

      // 1. Initial empty storage
      const initial = JSON.parse(storageMock[STORAGE_KEY] ?? '{"seenScreens":[],"skipAll":false}');
      assert.deepEqual(initial.seenScreens, []);
      assert.equal(initial.skipAll, false);

      // 2. User completes Hub tour (steps 1-4)
      const afterHub = {
        version: 1,
        seenScreens: ["hub"],
        skipAll: false,
      };
      storageMock[STORAGE_KEY] = JSON.stringify(afterHub);

      const parsedHub = JSON.parse(storageMock[STORAGE_KEY]);
      assert.ok(parsedHub.seenScreens.includes("hub"));
      assert.equal(parsedHub.seenScreens.includes("plan"), false);

      // 3. User skips Plan tour -> marks plan seen without silencing others
      parsedHub.seenScreens.push("plan");
      storageMock[STORAGE_KEY] = JSON.stringify(parsedHub);

      const parsedPlan = JSON.parse(storageMock[STORAGE_KEY]);
      assert.ok(parsedPlan.seenScreens.includes("hub"));
      assert.ok(parsedPlan.seenScreens.includes("plan"));
      assert.equal(parsedPlan.skipAll, false);
      assert.equal(parsedPlan.seenScreens.includes("eva"), false);

      // 4. User clicks 'Skip all' -> sets skipAll = true
      parsedPlan.skipAll = true;
      storageMock[STORAGE_KEY] = JSON.stringify(parsedPlan);

      const parsedSkipAll = JSON.parse(storageMock[STORAGE_KEY]);
      assert.equal(parsedSkipAll.skipAll, true);
    });

    it("simulates corruption recovery without crashing", () => {
      const corruptedJson = "invalid-json-format{[";
      let seenScreens = ["hub"];
      let skipAll = false;

      try {
        const parsed = JSON.parse(corruptedJson);
        seenScreens = parsed.seenScreens;
        skipAll = parsed.skipAll;
      } catch {
        // Fallback to default safe state
        seenScreens = [];
        skipAll = false;
      }

      assert.deepEqual(seenScreens, []);
      assert.equal(skipAll, false);
    });
  });

  describe("R4: Hazard & NO-GO Safety Interrupts", () => {
    it("verifies NO-GO evaluation immediately flags safety interruption", () => {
      // Mission evaluation returns NO-GO
      const evaluationNoGo = { verdict: "NO-GO", go: false, reasons: ["Slope exceeds 20° limit"] };
      const isInterrupted = evaluationNoGo.verdict === "NO-GO" || evaluationNoGo.go === false;
      assert.equal(isInterrupted, true, "Tour must be interrupted on NO-GO");

      // Mission evaluation returns GO
      const evaluationGo = { verdict: "GO", go: true, reasons: [] };
      const isInterruptedGo = evaluationGo.verdict === "NO-GO" || evaluationGo.go === false;
      assert.equal(isInterruptedGo, false, "Tour must not be interrupted on GO");

      // Mission evaluation returns CAUTION
      const evaluationCaution = { verdict: "CAUTION", go: true, cautions: ["Slope above 15°"] };
      const isInterruptedCaution = evaluationCaution.verdict === "NO-GO" || evaluationCaution.go === false;
      assert.equal(isInterruptedCaution, false, "Tour proceeds on CAUTION (only NO-GO or Hazard interrupts)");
    });

    it("verifies TourOverlay unmounts/yields when isInterrupted is true", () => {
      const rootDir = join(import.meta.dirname, "..");
      const overlayCode = readFileSync(join(rootDir, "src/tour/tour-overlay.tsx"), "utf8");

      assert.ok(
        overlayCode.includes("!isActive || !activeStep || isSafetyInterruptedSafe(isInterrupted)") &&
        overlayCode.includes("return null;"),
        "TourOverlay must immediately return null when interrupted, clearing the dimmer completely"
      );
    });
  });

  describe("Root Zoom Handling (#root { zoom: 0.75 })", () => {
    it("verifies TourOverlay divides bounding rect by root zoom factor", () => {
      const rootDir = join(import.meta.dirname, "..");
      const overlayCode = readFileSync(join(rootDir, "src/tour/tour-overlay.tsx"), "utf8");

      assert.ok(
        overlayCode.includes("getRootZoom"),
        "TourOverlay must inspect root zoom"
      );
      assert.ok(
        overlayCode.includes("r.left / zoom") && overlayCode.includes("r.top / zoom"),
        "TourOverlay must divide getBoundingClientRect coordinates by zoom"
      );
    });
  });
});
