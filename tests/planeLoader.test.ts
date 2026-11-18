import test from "node:test";
import assert from "node:assert/strict";
import { useAtcStore } from "../src/store/atcStore.ts";

test("Global Plane-in-Air Loader: setGlobalLoading activates and deactivates state correctly", () => {
  const store = useAtcStore.getState();

  // Initially null or inactive
  useAtcStore.setState({ globalLoading: null });
  assert.equal(useAtcStore.getState().globalLoading, null);

  // Activate with custom message and submessage
  store.setGlobalLoading(true, "Navigating Airspace", "CRUISING FL320");
  const activeLoading = useAtcStore.getState().globalLoading;
  assert.ok(activeLoading);
  assert.equal(activeLoading.active, true);
  assert.equal(activeLoading.message, "Navigating Airspace");
  assert.equal(activeLoading.submessage, "CRUISING FL320");

  // Deactivate
  store.setGlobalLoading(false);
  assert.equal(useAtcStore.getState().globalLoading, null);
});

test("Global Plane-in-Air Loader: setAppMode triggers loading screen across all screen transitions", async () => {
  const store = useAtcStore.getState();

  // Transition to GLOBAL_MAP
  store.setAppMode("GLOBAL_MAP");
  let current = useAtcStore.getState().globalLoading;
  assert.ok(current);
  assert.equal(current.active, true);
  assert.match(current.message ?? "", /Global Airspace/i);

  // Transition to SIMULATION
  store.setAppMode("SIMULATION");
  current = useAtcStore.getState().globalLoading;
  assert.ok(current);
  assert.equal(current.active, true);
  assert.match(current.message ?? "", /Radar Control/i);

  // Transition to MULTIPLAYER_LOBBY
  store.setAppMode("MULTIPLAYER_LOBBY");
  current = useAtcStore.getState().globalLoading;
  assert.ok(current);
  assert.equal(current.active, true);
  assert.match(current.message ?? "", /Multiplayer|Relay/i);

  // Transition to LIVE_OBSERVATION
  store.setAppMode("LIVE_OBSERVATION");
  current = useAtcStore.getState().globalLoading;
  assert.ok(current);
  assert.equal(current.active, true);
  assert.match(current.message ?? "", /ADS-B/i);

  // Transition to AIRPORT_EDITOR
  store.setAppMode("AIRPORT_EDITOR");
  current = useAtcStore.getState().globalLoading;
  assert.ok(current);
  assert.equal(current.active, true);
  assert.match(current.message ?? "", /CAD|Airport/i);

  // Transition to LANDING
  store.setAppMode("LANDING");
  current = useAtcStore.getState().globalLoading;
  assert.ok(current);
  assert.equal(current.active, true);
  assert.match(current.message ?? "", /Operations Terminal/i);

  // Wait for 500ms timeout to clear
  await new Promise((res) => setTimeout(res, 520));
  assert.equal(useAtcStore.getState().globalLoading, null);
});

test("Global Plane-in-Air Loader: selectAndSaveAirport triggers flight loader with airport info", async () => {
  const store = useAtcStore.getState();

  store.selectAndSaveAirport("KAST", "NORMAL_OPS", "ALL");
  const loading = useAtcStore.getState().globalLoading;
  assert.ok(loading);
  assert.equal(loading.active, true);
  assert.match(loading.message ?? "", /KAST/i);

  await new Promise((res) => setTimeout(res, 520));
  assert.equal(useAtcStore.getState().globalLoading, null);
});
