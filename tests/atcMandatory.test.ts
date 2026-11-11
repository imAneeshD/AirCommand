import test from "node:test";
import assert from "node:assert/strict";
import { runMandatoryVerificationSuite } from "../src/engine/verificationSuite.ts";

const results = runMandatoryVerificationSuite();

for (const res of results) {
  test(res.name, () => {
    assert.equal(res.passed, true, res.details);
  });
}
