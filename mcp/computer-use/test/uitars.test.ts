// Unit tests for the UI-TARS config/lifecycle helpers.
//
// Uses Node's built-in test runner (`node:test` + `node:assert`) so it runs
// without bun. These exercise only the deps-free surface of src/uitars.ts
// (resolveVlmConfig, compressScreenshot, the agent lifecycle no-op paths) and
// never touch the optional @ui-tars/* native deps.
//
// Run locally:  node --test --experimental-strip-types test/uitars.test.ts
// (the package "test" script is a CI no-op; this file is excluded from tsc.)
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  resolveVlmConfig,
  compressScreenshot,
  pauseGUIAgent,
  resumeGUIAgent,
  stopGUIAgent,
} from "../src/uitars.ts";

const origEnv = { ...process.env };

function clearVlmEnv() {
  delete process.env.UITARS_VLM_BASE_URL;
  delete process.env.UITARS_VLM_MODEL;
  delete process.env.UITARS_VLM_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.TOKENMIX_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.VLM_GATEWAY_URL;
  delete process.env.VLM_GATEWAY_KEY;
  delete process.env.MLX_UI_TARS_URL;
  delete process.env.NO_API_KEY;
}

describe("resolveVlmConfig", () => {
  beforeEach(clearVlmEnv);
  afterEach(() => {
    process.env = { ...origEnv };
    clearVlmEnv();
  });

  it("explicit UITARS_VLM vars return custom config", () => {
    process.env.UITARS_VLM_BASE_URL = "https://custom.example/v1";
    process.env.UITARS_VLM_MODEL = "my-model";
    process.env.UITARS_VLM_API_KEY = "key-explicit";
    const cfg = resolveVlmConfig();
    assert.equal(cfg.baseURL, "https://custom.example/v1");
    assert.equal(cfg.model, "my-model");
    assert.equal(cfg.apiKey, "key-explicit");
  });

  it("OPENROUTER_API_KEY alone returns OpenRouter", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    const cfg = resolveVlmConfig();
    assert.equal(cfg.baseURL, "https://openrouter.ai/api/v1");
    assert.equal(cfg.model, "bytedance/ui-tars-1.5-7b");
    assert.equal(cfg.apiKey, "sk-or-test");
  });

  it("TOKENMIX_API_KEY alone returns TokenMix", () => {
    process.env.TOKENMIX_API_KEY = "sk-tkmx-test";
    const cfg = resolveVlmConfig();
    assert.equal(cfg.baseURL, "https://api.tokenmix.ai/v1");
    assert.equal(cfg.model, "doubao-1.5-vision-pro");
    assert.equal(cfg.apiKey, "sk-tkmx-test");
  });

  it("GEMINI_API_KEY alone returns Gemini", () => {
    process.env.GEMINI_API_KEY = "sk-g-test";
    const cfg = resolveVlmConfig();
    assert.equal(
      cfg.baseURL,
      "https://generativelanguage.googleapis.com/v1beta/openai",
    );
    assert.equal(cfg.model, "gemini-2.5-flash");
    assert.equal(cfg.apiKey, "sk-g-test");
  });

  it("localhost URL allows empty API key", () => {
    process.env.UITARS_VLM_BASE_URL = "http://localhost:11435/v1";
    const cfg = resolveVlmConfig();
    assert.equal(cfg.baseURL, "http://localhost:11435/v1");
    assert.equal(cfg.apiKey, "");
    assert.equal(cfg.model, "bytedance/ui-tars-1.5-7b");
  });

  it("127.0.0.1 URL allows empty API key", () => {
    process.env.UITARS_VLM_BASE_URL = "http://127.0.0.1:8080/v1";
    const cfg = resolveVlmConfig();
    assert.equal(cfg.apiKey, "");
  });

  it("no keys throws", () => {
    assert.throws(() => resolveVlmConfig(), /No VLM API key/);
  });
});

describe("compressScreenshot", () => {
  it("compresses large image", async () => {
    const { Jimp } = await import("jimp");
    const img = new Jimp({ width: 2048, height: 1536, color: 0xff0000ff });
    const buf = await img.getBuffer("image/png");
    const raw = { base64: buf.toString("base64"), scaleFactor: 2 };
    const result = await compressScreenshot(raw);
    const resultImg = await Jimp.read(Buffer.from(result.base64, "base64"));
    assert.equal(resultImg.width, 1024);
    assert.equal(resultImg.height, 768);
    assert.equal(result.scaleFactor, 2);
  });

  it("small image stays same size", async () => {
    const { Jimp } = await import("jimp");
    const img = new Jimp({ width: 400, height: 300, color: 0x00ff00ff });
    const buf = await img.getBuffer("image/png");
    const raw = { base64: buf.toString("base64"), scaleFactor: 2 };
    const result = await compressScreenshot(raw);
    const resultImg = await Jimp.read(Buffer.from(result.base64, "base64"));
    assert.equal(resultImg.width, 400);
    assert.equal(resultImg.height, 300);
  });

  it("corrupted input returns raw unchanged", async () => {
    const raw = { base64: "not-a-valid-image!!!", scaleFactor: 1 };
    const result = await compressScreenshot(raw);
    assert.equal(result.base64, "not-a-valid-image!!!");
    assert.equal(result.scaleFactor, 1);
  });
});

describe("agent lifecycle", () => {
  it("pause with no agent returns message", () => {
    assert.equal(pauseGUIAgent(), "No active GUI agent");
  });

  it("resume with no agent returns message", () => {
    assert.equal(resumeGUIAgent(), "No active GUI agent");
  });

  it("stop with no agent returns message", () => {
    assert.equal(stopGUIAgent(), "No active GUI agent");
  });
});
