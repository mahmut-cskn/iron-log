// Run: NODE_PATH=<path containing playwright> node tests/iron-log.test.cjs
const { chromium, webkit } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const url = "file://" + path.resolve(__dirname, "../index.html");
(async () => {
  for (const [name, engine] of process.env.TEST_WEBKIT
    ? [["WebKit", webkit]]
    : [["Chrome", chromium]]) {
    const browser = await engine.launch({
      headless: true,
      ...(name === "Chrome" ? { channel: "chrome" } : {}),
    });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      timezoneId: "Europe/Istanbul",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const saved = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("iron-log-state")));
    await page.goto(url);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    let state = await saved();
    assert.equal(state.templates.length, 8);
    assert.equal(state.version, 2);
    assert.match(
      await page.locator(".recommendation").innerText(),
      /Full Body/,
    );
    assert.match(
      await page.locator(".recommendation").innerText(),
      /Henüz yeterli/,
    );
    assert.equal(state.sessions.length, 0);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.locator('[data-action=start][data-id="workout-a"]').click();
    const pull = page
      .locator("details")
      .filter({ hasText: "Assisted Pull-up" });
    await pull.locator("summary").click();
    await pull.locator("[data-set-field=assistance]").first().fill("65");
    await pull.locator("[data-set-field=reps]").first().fill("8");
    await pull.locator("[data-action=toggle-set]").first().click();
    await pull.locator("textarea").fill("İyi form <test>");
    await page.locator("[data-session-field=notes]").fill("Genel not");
    state = await saved();
    const activeId = state.settings.activeSessionId;
    assert.equal(state.sessions[0].results[1].sets[0].done, true);
    await page.reload();
    assert.equal((await saved()).settings.activeSessionId, activeId);
    await page.locator("[data-action=finish]").click();
    await page.locator("#confirm-yes").click();
    state = await saved();
    assert.equal(state.settings.activeSessionId, null);
    assert.equal(state.sessions[0].status, "completed");
    await page.locator("[data-nav=today]").click();
    await page.locator('[data-action=start][data-id="workout-b"]').click();
    assert.match(
      await page
        .locator("details")
        .filter({ hasText: "Assisted Pull-up" })
        .innerHTML(),
      /65 kg destek × 8 tekrar/,
    );
    // Template renaming and deletion of library exercise must not mutate snapshots.
    await page.locator("[data-nav=templates]").click();
    await page.locator("[data-action=edit-template]").first().click();
    await page.locator("#template-form [name=name]").fill("Yeni A");
    await page.locator("#template-form button[type=submit]").click();
    state = await saved();
    assert.equal(state.sessions[0].templateName, "Workout A");
    await page.locator("[data-nav=exercises]").click();
    await page.locator("[data-action=delete-exercise][data-id=pull]").click();
    await page.locator("#confirm-yes").click();
    state = await saved();
    assert(!state.exercises.some((e) => e.id === "pull"));
    assert.equal(
      state.sessions[0].results[1].exercise.name,
      "Assisted Pull-up",
    );
    assert.equal(
      state.sessions[1].results[1].exercise.name,
      "Assisted Pull-up",
    );
    // Historical edits persist and support adding/removing sets.
    await page.locator("[data-nav=history]").click();
    await page.locator("[data-action=session]").first().click();
    await page.locator("[data-action=edit-history]").click();
    const oldPull = page
      .locator("details")
      .filter({ hasText: "Assisted Pull-up" });
    await oldPull.locator("[data-set-field=assistance]").first().fill("60");
    await oldPull.locator("[data-action=add-set]").click();
    assert.equal((await saved()).sessions[0].results[1].sets.length, 4);
    await oldPull.locator("[data-action=remove-set]").last().click();
    await page.locator("#confirm-yes").click();
    assert.equal((await saved()).sessions[0].results[1].sets.length, 3);
    await page.locator("[data-action=save-history]").click();
    await page.reload();
    assert.equal((await saved()).sessions[0].results[1].sets[0].assistance, 60);
    // Round-trip import and rejection of invalid nested data.
    const backup = await saved();
    await page.locator("[data-nav=data]").click();
    let downloadPromise = page.waitForEvent("download");
    await page.locator("[data-action=export-json]").click();
    const downloaded = await downloadPromise;
    assert.match(downloaded.suggestedFilename(), /iron-log-backup/);
    await page.locator("#import-file").setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await page.locator("#confirm-yes").click();
    assert.deepEqual(await saved(), backup);
    const invalid = JSON.parse(JSON.stringify(backup));
    invalid.sessions[0].results[0].sets[0].duration = -1;
    await page.locator("#import-file").setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(invalid)),
    });
    await page.getByText("Yedek yüklenemedi", { exact: true }).waitFor();
    assert.deepEqual(await saved(), backup);
    await page.locator("[data-action=close-modal]").click();
    downloadPromise = page.waitForEvent("download");
    await page.locator("#coach-form button").click();
    assert.match((await downloadPromise).suggestedFilename(), /coach/);
    // Manual history is independent of the still-active workout.
    await page.locator("[data-nav=history]").click();
    await page.locator("[data-action=manual]").click();
    await page.locator("#manual-form [name=date]").fill("2026-09-01");
    await page.locator("#manual-form button.primary").click();
    await page.locator("[data-session-field=notes]").fill("Manuel kayıt");
    await page.locator("[data-action=save-history]").click();
    state = await saved();
    assert.equal(state.sessions[2].date, "2026-09-01");
    assert.equal(state.sessions[2].status, "completed");
    assert(state.settings.activeSessionId);
    await page.locator("[data-action=delete-session]").click();
    await page.locator("#confirm-no").click();
    assert.equal((await saved()).sessions.length, 3);
    await page.locator("[data-action=delete-session]").click();
    await page.locator("#confirm-yes").click();
    assert.equal((await saved()).sessions.length, 2);
    // Library creation, template creation and ordering.
    await page.locator("[data-nav=exercises]").click();
    await page.locator("[data-action=new-exercise]").click();
    await page.locator("#exercise-form [name=name]").fill("Biceps Curl");
    await page.locator("#exercise-form button.primary").click();
    await page.locator("[data-nav=templates]").click();
    await page.locator("[data-action=new-template]").click();
    await page.locator("#template-form [name=name]").fill("Workout C");
    await page.locator('[data-muscle-role="secondary"][value="legs"]').check();
    await page.locator('[data-muscle-role="primary"][value="legs"]').check();
    assert.equal(
      await page
        .locator('[data-muscle-role="secondary"][value="legs"]')
        .isChecked(),
      false,
    );
    await page
      .locator('#template-form [name="intensity"]')
      .selectOption("hard");
    await page
      .locator("#exercise-choice")
      .selectOption({ label: "Biceps Curl" });
    await page.locator("[data-action=add-entry]").click();
    await page.locator("#exercise-choice").selectOption({ label: "Plank" });
    await page.locator("[data-action=add-entry]").click();
    await page
      .locator('[data-action=move-entry][data-index="1"][data-delta="-1"]')
      .click();
    await page.locator("#template-form button.primary").click();
    state = await saved();
    assert.equal(
      state.templates.find((t) => t.name === "Workout C").exercises[0]
        .exerciseId,
      "plank",
    );
    assert.deepEqual(
      state.templates.find((t) => t.name === "Workout C").muscleGroups.primary,
      ["legs"],
    );
    assert.equal(
      state.templates.find((t) => t.name === "Workout C").intensity,
      "hard",
    );
    await page.locator("[data-nav=today]").click();
    await page.screenshot({
      path: "/tmp/iron-log-" + name.toLowerCase() + ".png",
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    // Mobile open-card layout, desktop layout, and storage failure recovery.
    const activePull = page
      .locator("details")
      .filter({ hasText: "Assisted Pull-up" });
    await activePull.locator("summary").click();
    await page.setViewportSize({ width: 320, height: 740 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.evaluate(() => {
      window.originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function () {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      };
    });
    await page
      .locator("[data-session-field=notes]")
      .fill("Storage failure test");
    assert.match(
      await page.locator("#warning").innerText(),
      /Veri kaydedilemedi/,
    );
    await page.evaluate(() => {
      Storage.prototype.setItem = window.originalSetItem;
    });
    await page.locator("[data-session-field=notes]").fill("Recovered storage");
    assert.equal((await saved()).sessions[1].notes, "Recovered storage");
    // Corruption is not silently overwritten or reseeded.
    await page.evaluate(() =>
      localStorage.setItem("iron-log-state", "broken-json"),
    );
    await page.reload();
    assert.match(
      await page.locator("#warning").innerText(),
      /Stored data could not be loaded/,
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("iron-log-state")),
      "broken-json",
    );
    // Old-format records retain original ambiguous fields and become drafts.
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem(
        "ironlog_2026-09-10_A",
        JSON.stringify({
          0: {
            sets: [{ weight: "5", reps: "dk", done: true }],
            note: "Isınma",
          },
          1: { sets: [{ weight: "70", reps: "8", done: true }] },
        }),
      );
    });
    await page.reload();
    state = await saved();
    assert.equal(state.sessions.length, 1);
    assert.equal(state.sessions[0].date, "2026-09-10");
    assert.equal(state.sessions[0].status, "draft");
    assert.equal(state.sessions[0].results[1].sets[0].assistance, 70);
    assert.match(state.sessions[0].results[0].notes, /alan 2 = dk/);
    await page.reload();
    assert.equal((await saved()).sessions.length, 1);
    // New programs share prior performance, and renamed metadata survives reload.
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('[data-action="start"][data-id="hard-mode"]').click();
    const hardPull = page
      .locator("details")
      .filter({ hasText: "Assisted Pull-up" });
    await hardPull.locator("summary").click();
    await hardPull.locator('[data-set-field="assistance"]').first().fill("75");
    await hardPull.locator('[data-set-field="reps"]').first().fill("8");
    await hardPull.locator('[data-action="toggle-set"]').first().click();
    await page.locator('[data-action="finish"]').click();
    await page.locator("#confirm-yes").click();
    const captured = (await saved()).sessions[0];
    assert.equal(captured.intensity, "hard");
    await page.locator('[data-nav="templates"]').click();
    await page
      .locator('[data-action="edit-template"][data-id="hard-mode"]')
      .click();
    await page.locator('#template-form [name="name"]').fill("Pazar programım");
    await page.locator('[data-muscle-role="primary"][value="back"]').uncheck();
    await page.locator("#template-form button.primary").click();
    assert.deepEqual((await saved()).sessions[0], captured);
    await page.reload();
    await page
      .locator('[data-action="start"][data-id="split-back-biceps"]')
      .first()
      .click();
    const sharedPull = page
      .locator("details")
      .filter({ hasText: "Assisted Pull-up" });
    assert.match(await sharedPull.innerHTML(), /75 kg destek × 8 tekrar/);
    assert.match(await sharedPull.innerHTML(), /HEDEF/);
    assert.match(await sharedPull.innerHTML(), /SON ANTRENMAN/);
    assert.match(await sharedPull.innerHTML(), /BUGÜN/);
    assert.deepEqual(errors, []);
    await browser.close();
    console.log(name + ": all functional and mobile checks passed");
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
