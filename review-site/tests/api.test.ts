import { describe, expect, it } from "vitest";
import { call, MAINTAINER, section, seedSchema, setup } from "./helpers";

type Listing = { sections: Record<string, unknown>[] };

describe("authentication", () => {
  it("returns 403 for every reviewer route without a valid token", async () => {
    await seedSchema();
    const routes: [string, string][] = [
      ["GET", "/api/sections"],
      ["POST", "/api/decisions"],
      ["GET", "/api/sections/x/reveal"],
      ["GET", "/api/nope"],
    ];
    for (const [method, path] of routes) {
      expect((await call(path, { method })).status).toBe(403);
      expect((await call(path, { method, token: "rv_unknown" })).status).toBe(403);
    }
  });

  it("returns 403 for every admin route without the maintainer token", async () => {
    await seedSchema();
    const routes: [string, string][] = [
      ["PUT", "/admin/sections"],
      ["POST", "/admin/tokens"],
      ["POST", "/admin/tokens/1/revoke"],
      ["GET", "/admin/export"],
      ["DELETE", "/admin/decisions?section=x"],
    ];
    for (const [method, path] of routes) {
      expect((await call(path, { method })).status).toBe(403);
      expect((await call(path, { method, maintainer: "wrong" })).status).toBe(403);
    }
  });

  it("a reviewer token is not a maintainer token", async () => {
    const token = await setup([section(1, 1)]);
    expect((await call("/admin/export", { maintainer: token })).status).toBe(403);
  });

  it("a revoked token gets 403", async () => {
    const token = await setup([section(1, 1)]);
    expect((await call("/api/sections", { token })).status).toBe(200);
    expect((await call("/admin/tokens/1/revoke", { method: "POST", maintainer: MAINTAINER })).status).toBe(200);
    expect((await call("/api/sections", { token })).status).toBe(403);
  });
});

describe("chapter range", () => {
  it("lists only the token's sections", async () => {
    const token = await setup([section(1, 1), section(2, 1), section(4, 1)], { from: 1, to: 2 });
    const body = (await (await call("/api/sections", { token })).json()) as Listing;
    expect(body.sections.map((s) => s.chapter)).toEqual([1, 2]);
  });

  it("rejects every reviewer route for a section outside the range", async () => {
    const outside = section(4, 1);
    const token = await setup([section(1, 1), outside], { from: 1, to: 3 });
    const decide = await call("/api/decisions", {
      method: "POST",
      token,
      body: { section_id: outside.id, phase: "blind", decision: "approve", text_hash: outside.text_hash },
    });
    expect(decide.status).toBe(403);
    expect((await call(`/api/sections/${encodeURIComponent(outside.id)}/reveal`, { token })).status).toBe(403);
  });
});

describe("blind-first", () => {
  it("the public payload carries no status, tags, rounds, or verdicts", async () => {
    const token = await setup([section(1, 1)]);
    const [s] = ((await (await call("/api/sections", { token })).json()) as Listing).sections;
    for (const key of ["review_status", "tags", "rounds", "rule_checks", "claims", "verdict", "flags", "modern_sentences"]) {
      expect(s).not.toHaveProperty(key);
    }
    expect(JSON.stringify(s)).not.toContain("machine_verified");
    expect(JSON.stringify(s)).not.toContain("dated_view");
    expect((s?.quotes as Record<string, unknown>[])[0]).toEqual({
      span: "The wind bloweth",
      osis: "John.3.8",
      kjv_text: "The wind bloweth where it listeth",
      bsb_text: "The wind blows where it wishes",
      bsb_note: null,
    });
  });

  it("reveal returns 409 until a blind decision exists for the current text", async () => {
    const s = section(1, 1);
    const token = await setup([s]);
    const reveal = () => call(`/api/sections/${encodeURIComponent(s.id)}/reveal`, { token });
    expect((await reveal()).status).toBe(409);
    const decide = await call("/api/decisions", {
      method: "POST",
      token,
      body: { section_id: s.id, phase: "blind", decision: "approve", text_hash: s.text_hash },
    });
    expect(decide.status).toBe(201);
    const res = await reveal();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ review_status: "machine_verified", tags: ["dated_view"] });

    // New text: the old blind decision no longer unlocks the reveal.
    await call("/admin/sections", {
      method: "PUT",
      maintainer: MAINTAINER,
      body: { sections: [{ ...s, text_hash: "hash-new" }] },
    });
    expect((await reveal()).status).toBe(409);
  });
});

describe("decisions", () => {
  it("a flag requires a type and a comment", async () => {
    const s = section(1, 1);
    const token = await setup([s]);
    const post = (extra: Record<string, unknown>) =>
      call("/api/decisions", {
        method: "POST",
        token,
        body: { section_id: s.id, phase: "blind", decision: "flag", text_hash: s.text_hash, ...extra },
      });
    expect((await post({ comment: "x" })).status).toBe(400);
    expect((await post({ type: "meaning" })).status).toBe(400);
    expect((await post({ type: "meaning", comment: "  " })).status).toBe(400);
    expect((await post({ type: "meaning", comment: "Claim 2 weakened" })).status).toBe(201);
  });

  it("a stale text hash gets 409; duplicates get 409; amended needs blind", async () => {
    const s = section(1, 1);
    const token = await setup([s]);
    const post = (phase: string, hash = s.text_hash) =>
      call("/api/decisions", {
        method: "POST",
        token,
        body: { section_id: s.id, phase, decision: "approve", text_hash: hash },
      });
    expect((await post("blind", "old-hash")).status).toBe(409);
    expect((await post("amended")).status).toBe(409);
    expect((await post("blind")).status).toBe(201);
    expect((await post("blind")).status).toBe(409);
    expect((await post("amended")).status).toBe(201);
    expect((await post("amended")).status).toBe(201);
  });

  it("the book introduction belongs to ranges that start at chapter 1", async () => {
    const intro = section(0, 1, { kind: "intro", osis_start: "John", osis_end: "John" });
    const first = await setup([intro, section(1, 2)], { from: 1, to: 1 });
    const listed = ((await (await call("/api/sections", { token: first })).json()) as Listing).sections;
    expect(listed.map((s) => s.chapter)).toEqual([0, 1]);
    const later = await (
      await call("/admin/tokens", {
        method: "POST",
        maintainer: MAINTAINER,
        body: { reviewer: "pastor", book: "John", chapter_from: 2, chapter_to: 3 },
      })
    ).json();
    const token = (later as { token: string }).token;
    expect((await call(`/api/sections/${encodeURIComponent(intro.id)}/reveal`, { token })).status).toBe(403);
  });

  it("the server copies hash, status, and round from the section; export includes them", async () => {
    const s = section(1, 1, { rounds: [{ round: 0 }, { round: 2 }] });
    const token = await setup([s], { reviewer: "study-leader", from: 1, to: 1 });
    await call("/api/decisions", {
      method: "POST",
      token,
      body: { section_id: s.id, phase: "blind", decision: "approve", dated_view: true, text_hash: s.text_hash },
    });
    const { decisions } = (await (await call("/admin/export", { maintainer: MAINTAINER })).json()) as {
      decisions: Record<string, unknown>[];
    };
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      section_id: s.id,
      reviewer: "study-leader",
      phase: "blind",
      decision: "approve",
      dated_view: 1,
      text_hash: s.text_hash,
      status_at_review: "machine_verified",
      round: 2,
    });
    const del = await call(`/admin/decisions?section=${encodeURIComponent(s.id)}`, {
      method: "DELETE",
      maintainer: MAINTAINER,
    });
    expect(await del.json()).toEqual({ deleted: 1 });
  });

  it("sections without modern text use the unmodernized hash", async () => {
    const s = section(1, 1, { modern_text: null, text_hash: null });
    const token = await setup([s]);
    const [listed] = ((await (await call("/api/sections", { token })).json()) as Listing).sections;
    expect(listed?.text_hash).toBe("unmodernized");
    await call("/api/decisions", {
      method: "POST",
      token,
      body: { section_id: s.id, phase: "blind", decision: "approve", text_hash: "unmodernized" },
    });
    const { decisions } = (await (await call("/admin/export", { maintainer: MAINTAINER })).json()) as {
      decisions: Record<string, unknown>[];
    };
    expect(decisions[0]?.text_hash).toBeNull();
  });
});
