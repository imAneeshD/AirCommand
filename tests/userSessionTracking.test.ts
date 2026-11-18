import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseService, type UserSessionRecord } from "../server/db/DatabaseService.ts";

test("DatabaseService: user_sessions table stores, updates, and retrieves user session records", () => {
  const testDbPath = path.resolve("server/data/test_user_sessions.db");
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  } catch {}

  const db = new DatabaseService(testDbPath);

  const sampleSession: UserSessionRecord = {
    id: "ses_test_101",
    email: "captain@aircommand.aero",
    sessionId: "ses_test_101",
    startedAt: "2026-11-18T17:00:00.000Z",
    endedAt: "2026-11-18T17:35:00.000Z",
    durationSeconds: 2100,
    airportIcao: "VOBL",
    airportName: "Kempegowda International Airport Bengaluru",
    scenario: "NORMAL_OPS",
    role: "GROUND",
    departuresCompleted: 15,
    arrivalsCompleted: 12,
    clearancesIssued: 42,
    safetyScore: 98,
    conflicts: 0,
    clientIp: "127.0.0.1",
    userAgent: "NodeTestAgent/1.0",
    payloadJson: JSON.stringify({ notes: "Flawless ground routing" }),
    createdAt: "2026-11-18T17:35:05.000Z",
  };

  // 1. Save new session
  db.saveUserSession(sampleSession);

  // 2. Retrieve all sessions
  const sessions = db.getAllUserSessions();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, "ses_test_101");
  assert.equal(sessions[0].email, "captain@aircommand.aero");
  assert.equal(sessions[0].airportIcao, "VOBL");
  assert.equal(sessions[0].durationSeconds, 2100);
  assert.equal(sessions[0].safetyScore, 98);

  // 3. Upsert update (incremental heartbeat update)
  const updatedSession: UserSessionRecord = {
    ...sampleSession,
    endedAt: "2026-11-18T17:40:00.000Z",
    durationSeconds: 2400,
    departuresCompleted: 18,
    clearancesIssued: 48,
  };
  db.saveUserSession(updatedSession);

  const updatedList = db.getAllUserSessions();
  assert.equal(updatedList.length, 1, "Upsert on same id must not duplicate session row");
  assert.equal(updatedList[0].durationSeconds, 2400);
  assert.equal(updatedList[0].departuresCompleted, 18);

  // 4. Stats aggregation
  const secondUserSession: UserSessionRecord = {
    id: "ses_test_102",
    email: "firstofficer@sky.org",
    sessionId: "ses_test_102",
    startedAt: "2026-11-18T18:00:00.000Z",
    endedAt: "2026-11-18T18:30:00.000Z",
    durationSeconds: 1800,
    airportIcao: "OMAA",
    airportName: "Abu Dhabi International",
    scenario: "RUSH_HOUR",
    role: "TOWER",
    departuresCompleted: 10,
    arrivalsCompleted: 8,
    clearancesIssued: 30,
    safetyScore: 94,
    conflicts: 0,
  };
  db.saveUserSession(secondUserSession);

  const stats = db.getUserSessionStats();
  assert.equal(stats.totalSessions, 2);
  assert.equal(stats.uniqueUsers, 2);
  assert.equal(stats.totalDurationSeconds, 2400 + 1800);

  db.close();

  // Cleanup test DB
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  } catch {}
});
