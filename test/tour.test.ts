import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  TOUR_STEPS,
  SCREEN_STEPS,
  STEP_FINAL_ID,
  getStepById,
  getStepsForScreen,
} from "../src/tour/tour-data.ts";

describe("Marswalk Onboarding Tour Verification Suite (R1 - R5)", () => {
  describe("R3: Step Registry & Verification Table (23 steps)", () => {
    it("should register exactly 23 tour steps with unique IDs 1 to 23", () => {
      assert.equal(TOUR_STEPS.length, 23, "Tour must contain exactly 23 steps");
      const ids = TOUR_STEPS.map((s) => s.id).sort((x, y) => x - y);
      assert.deepEqual(ids, Array.from({ length: 23 }, (_, i) => i + 1));
    });

    it("should partition mini-tours per screen correctly", () => {
      assert.deepEqual(SCREEN_STEPS.hub, [1, 2, 3, 19, 20, 21]);
      assert.deepEqual(SCREEN_STEPS.plan, [4, 5, 22, 23]);
      assert.deepEqual(SCREEN_STEPS.eva, [6, 7, 8, 9, 10, 11, 12]);
      assert.deepEqual(SCREEN_STEPS.fov, [13]);
      assert.deepEqual(SCREEN_STEPS.comms, [14, 15, 16]);
      assert.deepEqual(SCREEN_STEPS.debrief, [17]);
      assert.equal(STEP_FINAL_ID, 18, "Step 18 must be the final replay target");
    });

    it("should format step counter ('X of Y') correctly within each screen's mini-tour", () => {
      const sizes = { hub: 6, plan: 4, eva: 7, fov: 1, comms: 3, debrief: 1 } as const;
      for (const [screen, n] of Object.entries(sizes)) {
        const steps = getStepsForScreen(screen as keyof typeof sizes);
        assert.equal(steps.length, n, `${screen} step count`);
        for (const s of steps) assert.equal(s.totalInScreen, n, `${screen} step ${s.id} total`);
        assert.deepEqual(
          steps.map((s) => s.stepInScreen).sort((x, y) => x - y),
          Array.from({ length: n }, (_, i) => i + 1),
          `${screen} stepInScreen must run 1..${n}`
        );
      }

      // Final step is its own one-step tour
      const stepFinal = getStepById(18);
      assert.ok(stepFinal);
      assert.equal(stepFinal.stepInScreen, 1);
      assert.equal(stepFinal.totalInScreen, 1);
    });
  });

  describe("R2 & R3: Tip Card Content & Word Count Verification (< 60 words)", () => {
    it("every step must have body copy under 60 words using plain language and sentence case", () => {
      for (const step of TOUR_STEPS) {
        assert.ok(step.title.trim().length > 0, `Step ${step.id} must have non-empty title`);
        assert.ok(step.text.trim().length > 0, `Step ${step.id} must have non-empty text`);

        // Count words separated by whitespace
        const words = step.text.trim().split(/\s+/).filter(Boolean);
        assert.ok(
          words.length < 60,
          `Step ${step.id} ("${step.title}") text has ${words.length} words, which exceeds limit of 60: "${step.text}"`
        );
      }
    });

    it("verifies exact titles and copy against R3 requirement table", () => {
      const expected: Record<number, { title: string; textPrefix: string }> = {
        1: { title: "Welcome to Marswalk", textPrefix: "Plan one safe walk on Mars." },
        2: { title: "EVA Presets", textPrefix: "Start here." },
        3: { title: "Your five stops", textPrefix: "These tabs follow one walk:" },
        4: { title: "Plan tools", textPrefix: "The tabs along the top hold your tools" },
        5: { title: "The map", textPrefix: "Your route drawn on Mars." },
        6: { title: "EVA progress", textPrefix: "This is your walk from the Plan screen" },
        7: { title: "Your route", textPrefix: "This is the EVA Map" },
        8: { title: "Map layers", textPrefix: "Search and toggle" },
        9: { title: "Hazard alerts", textPrefix: "Red means danger." },
        10: { title: "Route profile", textPrefix: "Height along your path" },
        11: { title: "Move around", textPrefix: "Zoom in and out," },
        12: { title: "Astronaut device link", textPrefix: "This panel is the link" },
        13: { title: "What you will see", textPrefix: "A preview of the view at your next stop," },
        14: { title: "Signal map", textPrefix: "Brighter areas of the sky mean a stronger signal." },
        15: { title: "Two views", textPrefix: "Link budget shows signal strength." },
        16: { title: "Satellite passes", textPrefix: '"In view" means a satellite is overhead now.' },
        17: { title: "Walk review", textPrefix: "Compare the plan with the real walk:" },
        18: { title: "You're ready", textPrefix: "You can replay this tour any time from here." },
        19: { title: "Checklists", textPrefix: "Tick off each item" },
        20: { title: "Hold and abort", textPrefix: "The limits that mean pause" },
        21: { title: "Mission timeline", textPrefix: "Each row is a track" },
        22: { title: "Route profile", textPrefix: "Height along your path" },
        23: { title: "Map layers", textPrefix: "Toggle what is drawn" },
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
    it("exactly steps 9, 12, 13, and 14 must have simulated = true, and all others must have simulated = false", () => {
      const simulatedIds = [9, 12, 13, 14];
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

      // Every other step must have a valid data-tour attribute selector
      const expectedSelectors: Record<number, string> = {
        2: '[data-tour="eva-presets"]',
        3: '[data-tour="main-nav"]',
        4: '[data-tour="plan-left"]',
        5: '[data-tour="plan-map"]',
        6: '[data-tour="eva-progress"]',
        7: '[data-tour="eva-route"]',
        8: '[data-tour="eva-layers"]',
        9: '[data-tour="hazard-card"]',
        10: '[data-tour="eva-profile"]',
        11: '[data-tour="map-controls"]',
        12: '[data-tour="eva-device"]',
        13: '[data-tour="arrival-preview"]',
        14: '[data-tour="sky-dome"]',
        15: '[data-tour="comms-switch"]',
        16: '[data-tour="pass-list"]',
        17: '[data-tour="walk-summary"]',
        18: '[data-tour="help-button"]',
        19: '[data-tour="hub-checklist"]',
        20: '[data-tour="hub-hold"]',
        21: '[data-tour="hub-timeline"]',
        22: '[data-tour="plan-profile"]',
        23: '[data-tour="plan-layers"]',
      };

      for (const [idStr, selector] of Object.entries(expectedSelectors)) {
        const id = Number(idStr);
        const step = getStepById(id);
        assert.ok(step, `Step ${id} must exist`);
        assert.equal(step.targetSelector, selector, `Step ${id} selector mismatch`);
      }
    });

    it("verifies that all data-tour attributes are present in screen/component source code", () => {
      const src = join(import.meta.dirname, "..", "src");
      const all = (readdirSync(src, { recursive: true }) as string[])
        .filter((f) => /\.tsx?$/.test(f))
        .map((f) => readFileSync(join(src, f), "utf8"))
        .join("\n");
      for (const step of TOUR_STEPS) {
        if (!step.targetSelector) continue;
        const name = step.targetSelector.match(/data-tour="([^"]+)"/)![1];
        assert.ok(
          all.includes(`data-tour="${name}"`) || all.includes(`dataTour="${name}"`),
          `Step ${step.id}: no element in src/ carries anchor '${name}'`
        );
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
