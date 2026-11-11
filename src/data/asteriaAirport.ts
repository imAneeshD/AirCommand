import type {
  AirportId,
  AirportLayout,
  NavFix,
  RunwayId,
  RunwaySpec,
  TaxiEdge,
  TaxiNode,
  TaxiwayName,
} from "../types/atc.ts";
import { ICAO_LETTER_MAP, spellDigitsIcao } from "../utils/natoPhonetics.ts";

export interface AirportSummary {
  id: AirportId;
  icao: AirportId;
  name: string;
  city: string;
  difficulty: AirportLayout["difficulty"];
  runwaySummary: string;
  elevationFt: number;
  windLabel: string;
  description: string;
}

export function alongRunwayNm(rwy: RunwaySpec, x: number, y: number): number {
  return (x - rwy.thresholdX) * rwy.ux + (y - rwy.thresholdY) * rwy.uy;
}

export function crossTrackRunwayNm(rwy: RunwaySpec, x: number, y: number): number {
  // Positive = left of runway heading vector (i.e. North on Eastbound 090, South on Westbound 270)
  return (x - rwy.thresholdX) * -rwy.uy + (y - rwy.thresholdY) * rwy.ux;
}

export function runwayPoint(
  rwy: RunwaySpec,
  alongNm: number,
  crossNm = 0
): { x: number; y: number } {
  return {
    x: rwy.thresholdX + alongNm * rwy.ux + crossNm * -rwy.uy,
    y: rwy.thresholdY + alongNm * rwy.uy + crossNm * rwy.ux,
  };
}

export function headingDiffDeg(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function makeRunwaySpec(opts: {
  id: RunwayId;
  oppositeId: string;
  heading: number;
  thresholdX: number;
  thresholdY: number;
  lengthNm: number;
  widthNm?: number;
  elevationFt: number;
  entryNodeIds: string[];
  exitNodeIds: string[];
  crossingNodeIds: string[];
  holdShortNodeIds: string[];
}): RunwaySpec {
  const rad = (opts.heading * Math.PI) / 180;
  const ux = Math.sin(rad);
  const uy = Math.cos(rad);
  return {
    id: opts.id,
    oppositeId: opts.oppositeId,
    heading: opts.heading,
    thresholdX: opts.thresholdX,
    thresholdY: opts.thresholdY,
    endX: opts.thresholdX + opts.lengthNm * ux,
    endY: opts.thresholdY + opts.lengthNm * uy,
    ux,
    uy,
    lengthNm: opts.lengthNm,
    widthNm: opts.widthNm ?? 0.036,
    elevationFt: opts.elevationFt,
    entryNodeIds: opts.entryNodeIds,
    exitNodeIds: opts.exitNodeIds,
    crossingNodeIds: opts.crossingNodeIds,
    holdShortNodeIds: opts.holdShortNodeIds,
  };
}

function makeGraphBuilder() {
  const nodes: Record<string, TaxiNode> = {};
  const edges: TaxiEdge[] = [];

  const addNode = (node: TaxiNode) => {
    nodes[node.id] = node;
  };

  const addEdge = (
    from: string,
    to: string,
    taxiway: TaxiwayName,
    runwayCrossing?: RunwayId
  ) => {
    edges.push({
      id: `${from}__${to}__${taxiway}`,
      from,
      to,
      taxiway,
      runwayCrossing,
    });
    edges.push({
      id: `${to}__${from}__${taxiway}`,
      from: to,
      to: from,
      taxiway,
      runwayCrossing,
    });
  };

  return { nodes, edges, addNode, addEdge };
}

// =============================================================================
// 1. KAST — Asteria International Airport (Staggered Parallel 09L / 09R + Rapid Exits)
// =============================================================================
export function createAsteriaAirport(): AirportLayout {
  const { nodes, edges, addNode, addEdge } = makeGraphBuilder();
  const Y_RWY_09L = 0.22;
  const Y_RWY_09R = -0.18;

  type ColKey = "B" | "C" | "D" | "E" | "H";
  interface ColGeometry {
    col: ColKey;
    aX: number;
    aY: number;
    hsLNX: number;
    rwyLX: number;
    hsLSX: number;
    fX: number;
    fY: number;
    hsRNX: number;
    rwyRX: number;
    hsRSX: number;
    gX: number;
    gY: number;
  }

  // Sculpted asymmetric columns: curved West perimeter (B), rapid-exit angled exits (D/E), swept East perimeter (H)
  const cols: ColGeometry[] = [
    {
      col: "B",
      aX: -1.02, aY: 0.35,
      hsLNX: -0.92, rwyLX: -0.92, hsLSX: -0.88,
      fX: -0.82, fY: 0.02,
      hsRNX: -0.76, rwyRX: -0.74, hsRSX: -0.77,
      gX: -0.84, gY: -0.34,
    },
    {
      col: "C",
      aX: -0.59, aY: 0.36,
      hsLNX: -0.55, rwyLX: -0.53, hsLSX: -0.50,
      fX: -0.45, fY: 0.02,
      hsRNX: -0.40, rwyRX: -0.38, hsRSX: -0.39,
      gX: -0.43, gY: -0.36,
    },
    {
      col: "D",
      aX: -0.04, aY: 0.39,
      hsLNX: 0.04, rwyLX: -0.05, hsLSX: 0.06,
      fX: 0.15, fY: 0.02,
      hsRNX: 0.24, rwyRX: 0.13, hsRSX: 0.24,
      gX: 0.30, gY: -0.36,
    },
    {
      col: "E",
      aX: 0.50, aY: 0.36,
      hsLNX: 0.58, rwyLX: 0.48, hsLSX: 0.58,
      fX: 0.66, fY: 0.02,
      hsRNX: 0.74, rwyRX: 0.64, hsRSX: 0.74,
      gX: 0.80, gY: -0.36,
    },
    {
      col: "H",
      aX: 0.78, aY: 0.35,
      hsLNX: 0.84, rwyLX: 0.83, hsLSX: 0.89,
      fX: 0.98, fY: 0.02,
      hsRNX: 1.07, rwyRX: 1.13, hsRSX: 1.15,
      gX: 1.06, gY: -0.34,
    },
  ];

  const colChains: Array<{ taxiway: TaxiwayName; nodeIds: string[] }> = [];

  for (const c of cols) {
    const col = c.col;
    const aId = `A_${col}`;
    const hs09LN = `HS_09L_${col}_N`;
    const rwy09L = `RWY_09L_${col}`;
    const hs09LS = `HS_09L_${col}_S`;
    const fId = `F_${col}`;
    const hs09RN = `HS_09R_${col}_N`;
    const rwy09R = `RWY_09R_${col}`;
    const hs09RS = `HS_09R_${col}_S`;
    const gId = `G_${col}`;

    addNode({ id: aId, x: c.aX, y: c.aY, kind: "TAXIWAY", label: `A/${col}` });
    addNode({
      id: hs09LN,
      x: c.hsLNX,
      y: Y_RWY_09L + 0.06,
      kind: "HOLD_SHORT",
      label: `HS 09L (${col}N)`,
      holdShortForRunway: "09L",
      isNorthSide: true,
    });
    addNode({
      id: rwy09L,
      x: c.rwyLX,
      y: Y_RWY_09L,
      kind: col === "B" || col === "C" ? "RUNWAY_ENTRY" : "RUNWAY_EXIT",
      label: `09L/${col}`,
      runwayId: "09L",
    });
    addNode({
      id: hs09LS,
      x: c.hsLSX,
      y: Y_RWY_09L - 0.06,
      kind: "HOLD_SHORT",
      label: `HS 09L (${col}S)`,
      holdShortForRunway: "09L",
      isNorthSide: false,
    });
    addNode({ id: fId, x: c.fX, y: c.fY, kind: "TAXIWAY", label: `F/${col}` });
    addNode({
      id: hs09RN,
      x: c.hsRNX,
      y: Y_RWY_09R + 0.06,
      kind: "HOLD_SHORT",
      label: `HS 09R (${col}N)`,
      holdShortForRunway: "09R",
      isNorthSide: true,
    });
    addNode({
      id: rwy09R,
      x: c.rwyRX,
      y: Y_RWY_09R,
      kind: col === "B" || col === "C" ? "RUNWAY_ENTRY" : "RUNWAY_EXIT",
      label: `09R/${col}`,
      runwayId: "09R",
    });
    addNode({
      id: hs09RS,
      x: c.hsRSX,
      y: Y_RWY_09R - 0.06,
      kind: "HOLD_SHORT",
      label: `HS 09R (${col}S)`,
      holdShortForRunway: "09R",
      isNorthSide: false,
    });
    addNode({ id: gId, x: c.gX, y: c.gY, kind: "TAXIWAY", label: `G/${col}` });

    addEdge(aId, hs09LN, col);
    addEdge(hs09LN, rwy09L, col, "09L");
    addEdge(rwy09L, hs09LS, col, "09L");
    addEdge(hs09LS, fId, col);
    addEdge(fId, hs09RN, col);
    addEdge(hs09RN, rwy09R, col, "09R");
    addEdge(rwy09R, hs09RS, col, "09R");
    addEdge(hs09RS, gId, col);

    colChains.push({
      taxiway: col,
      nodeIds: [aId, hs09LN, rwy09L, hs09LS, fId, hs09RN, rwy09R, hs09RS, gId],
    });
  }

  // Swept crescent Terminal Concourse B & A gates
  const northGates = [
    { gateId: "B10", x: -0.45, ay: 0.375, pbY: 0.442, gateY: 0.51 },
    { gateId: "B11", x: -0.33, ay: 0.388, pbY: 0.462, gateY: 0.53 },
    { gateId: "B12", x: -0.20, ay: 0.398, pbY: 0.472, gateY: 0.54 },
    { gateId: "B13", x: -0.11, ay: 0.40, pbY: 0.472, gateY: 0.54 },
    { gateId: "B14", x: 0.10, ay: 0.398, pbY: 0.472, gateY: 0.54 },
    { gateId: "A1", x: 0.23, ay: 0.39, pbY: 0.462, gateY: 0.53 },
    { gateId: "A2", x: 0.34, ay: 0.38, pbY: 0.447, gateY: 0.515 },
    { gateId: "A3", x: 0.44, ay: 0.37, pbY: 0.432, gateY: 0.50 },
  ];

  for (const g of northGates) {
    addNode({
      id: `GATE_${g.gateId}`,
      x: g.x,
      y: g.gateY,
      kind: "GATE",
      label: g.gateId,
      gateId: g.gateId,
      pairedSpotId: `PB_${g.gateId}`,
      isNorthSide: true,
    });
    addNode({
      id: `PB_${g.gateId}`,
      x: g.x,
      y: g.pbY,
      kind: "PUSHBACK_SPOT",
      label: `Spot ${g.gateId}`,
      gateId: g.gateId,
      isNorthSide: true,
    });
    addNode({
      id: `A_${g.gateId}`,
      x: g.x,
      y: g.ay,
      kind: "TAXIWAY",
      label: `A/${g.gateId}`,
      isNorthSide: true,
    });
    addEdge(`GATE_${g.gateId}`, `PB_${g.gateId}`, "APRON");
    addEdge(`PB_${g.gateId}`, `A_${g.gateId}`, "APRON");
  }

  const alphaChain = [
    "A_B", "A_C", "A_B10", "A_B11", "A_B12", "A_B13",
    "A_D", "A_B14", "A_A1", "A_A2", "A_A3", "A_E", "A_H",
  ];
  for (let i = 0; i < alphaChain.length - 1; i++) addEdge(alphaChain[i], alphaChain[i + 1], "A");

  const foxtrotChain = ["F_B", "F_C", "F_D", "F_E", "F_H"];
  for (let i = 0; i < foxtrotChain.length - 1; i++) addEdge(foxtrotChain[i], foxtrotChain[i + 1], "F");

  const southGates = [
    { gateId: "S1", x: -0.26, gy: -0.37, pbY: -0.432, gateY: -0.50 },
    { gateId: "S2", x: 0.02, gy: -0.375, pbY: -0.442, gateY: -0.51 },
    { gateId: "S3", x: 0.52, gy: -0.37, pbY: -0.432, gateY: -0.50 },
  ];
  for (const g of southGates) {
    addNode({
      id: `GATE_${g.gateId}`,
      x: g.x,
      y: g.gateY,
      kind: "GATE",
      label: g.gateId,
      gateId: g.gateId,
      pairedSpotId: `PB_${g.gateId}`,
      isNorthSide: false,
    });
    addNode({
      id: `PB_${g.gateId}`,
      x: g.x,
      y: g.pbY,
      kind: "PUSHBACK_SPOT",
      label: `Spot ${g.gateId}`,
      gateId: g.gateId,
      isNorthSide: false,
    });
    addNode({
      id: `G_${g.gateId}`,
      x: g.x,
      y: g.gy,
      kind: "TAXIWAY",
      label: `G/${g.gateId}`,
      isNorthSide: false,
    });
    addEdge(`GATE_${g.gateId}`, `PB_${g.gateId}`, "APRON");
    addEdge(`PB_${g.gateId}`, `G_${g.gateId}`, "APRON");
  }

  const golfChain = ["G_B", "G_C", "G_S1", "G_S2", "G_D", "G_S3", "G_E", "G_H"];
  for (let i = 0; i < golfChain.length - 1; i++) addEdge(golfChain[i], golfChain[i + 1], "G");

  const runways: Record<string, RunwaySpec> = {
    "09L": makeRunwaySpec({
      id: "09L",
      oppositeId: "27R",
      heading: 90,
      thresholdX: -0.96,
      thresholdY: Y_RWY_09L,
      lengthNm: 1.82,
      elevationFt: 42,
      entryNodeIds: ["RWY_09L_B", "RWY_09L_C"],
      exitNodeIds: ["RWY_09L_D", "RWY_09L_E", "RWY_09L_H"],
      crossingNodeIds: ["RWY_09L_B", "RWY_09L_C", "RWY_09L_D", "RWY_09L_E", "RWY_09L_H"],
      holdShortNodeIds: cols.flatMap((c) => [`HS_09L_${c.col}_N`, `HS_09L_${c.col}_S`]),
    }),
    "09R": makeRunwaySpec({
      id: "09R",
      oppositeId: "27L",
      heading: 90,
      thresholdX: -0.78,
      thresholdY: Y_RWY_09R,
      lengthNm: 1.98,
      elevationFt: 42,
      entryNodeIds: ["RWY_09R_B", "RWY_09R_C"],
      exitNodeIds: ["RWY_09R_D", "RWY_09R_E", "RWY_09R_H"],
      crossingNodeIds: ["RWY_09R_B", "RWY_09R_C", "RWY_09R_D", "RWY_09R_E", "RWY_09R_H"],
      holdShortNodeIds: cols.flatMap((c) => [`HS_09R_${c.col}_N`, `HS_09R_${c.col}_S`]),
    }),
  };

  const fixes: Record<string, NavFix> = {
    BRIAR: { id: "BRIAR", x: -11.5, y: 4.2, kind: "ARRIVAL", label: "BRIAR (NW ARR)" },
    CORAL: { id: "CORAL", x: -11.5, y: -4.2, kind: "ARRIVAL", label: "CORAL (SW ARR)" },
    IF09L: { id: "IF09L", x: -6.5, y: Y_RWY_09L, kind: "IAF", label: "IF09L (ILS 09L)" },
    IF09R: { id: "IF09R", x: -6.5, y: Y_RWY_09R, kind: "IAF", label: "IF09R (ILS 09R)" },
    ASTER1: { id: "ASTER1", x: 8.5, y: 4.5, kind: "DEPARTURE", label: "ASTER1 (NE DEP)" },
    DELTA: { id: "DELTA", x: 9.8, y: -0.2, kind: "DEPARTURE", label: "DELTA (E DEP)" },
    ECHO: { id: "ECHO", x: 7.8, y: -4.8, kind: "DEPARTURE", label: "ECHO (SE DEP)" },
    MISSED: { id: "MISSED", x: 5.5, y: 1.8, kind: "MISSED", label: "MISSED (GA FIX)" },
  };

  // Sculpted organic apron concrete pads wrapping curved concourses & cargo hub
  const apronPolygons = [
    [
      { x: -0.56, y: 0.36 },
      { x: -0.50, y: 0.56 },
      { x: -0.24, y: 0.64 },
      { x: 0.22, y: 0.64 },
      { x: 0.46, y: 0.56 },
      { x: 0.54, y: 0.36 },
      { x: 0.24, y: 0.40 },
      { x: -0.18, y: 0.41 },
    ],
    [
      { x: -0.40, y: -0.36 },
      { x: -0.36, y: -0.58 },
      { x: 0.14, y: -0.58 },
      { x: 0.22, y: -0.49 },
      { x: 0.42, y: -0.49 },
      { x: 0.64, y: -0.58 },
      { x: 0.72, y: -0.36 },
      { x: 0.20, y: -0.37 },
    ],
  ];

  // Sculpted Y-Terminal concourse + jetbridges + South Cargo Hangars + Octagonal Control Tower
  const terminalBuildings: AirportLayout["terminalBuildings"] = [
    {
      name: "NORTH TERMINAL",
      kind: "TERMINAL",
      label: "TERMINAL A/B",
      labelX: -0.02,
      labelY: 0.61,
      polygon: [
        { x: -0.46, y: 0.54 },
        { x: -0.20, y: 0.575 },
        { x: -0.10, y: 0.66 },
        { x: 0.08, y: 0.66 },
        { x: 0.18, y: 0.575 },
        { x: 0.44, y: 0.535 },
        { x: 0.42, y: 0.50 },
        { x: 0.15, y: 0.54 },
        { x: 0.04, y: 0.565 },
        { x: -0.06, y: 0.565 },
        { x: -0.17, y: 0.54 },
        { x: -0.44, y: 0.505 },
      ],
      jetbridges: northGates.map((g) => ({
        x1: g.x,
        y1: g.gateY + 0.032,
        x2: g.x,
        y2: g.gateY + 0.004,
      })),
    },
    {
      kind: "CARGO",
      label: "CARGO",
      labelX: -0.12,
      labelY: -0.555,
      polygon: [
        { x: -0.33, y: -0.53 },
        { x: -0.06, y: -0.53 },
        { x: -0.06, y: -0.585 },
        { x: -0.25, y: -0.595 },
        { x: -0.35, y: -0.565 },
      ],
    },
    {
      kind: "HANGAR",
      label: "MRO HANGARS",
      labelX: 0.52,
      labelY: -0.56,
      polygon: [
        { x: 0.42, y: -0.525 },
        { x: 0.62, y: -0.535 },
        { x: 0.65, y: -0.59 },
        { x: 0.46, y: -0.595 },
      ],
    },
  ];

  return {
    id: "KAST",
    icao: "KAST",
    name: "Asteria International Airport",
    city: "Asteria Metro",
    controllerPrefix: "Asteria",
    difficulty: "STANDARD",
    description: "Staggered parallel hub with angled rapid-exit taxiways, curved bypass loops, and crescent Concourses A/B.",
    windText: "090 at 8",
    windLabel: "WIND 090/08KT",
    elevationFt: 42,
    chartRotationDeg: 38,
    runwayIds: ["09L", "09R"],
    primaryDepartureRunway: "09L",
    primaryArrivalRunway: "09R",
    runways,
    nodes,
    edges,
    fixes,
    gateIds: ["B10", "B11", "B12", "B13", "B14", "A1", "A2", "A3", "S1", "S2", "S3"],
    arrivalFixIds: ["BRIAR", "CORAL"],
    departureFixIds: ["ASTER1", "DELTA", "ECHO"],
    iafByRunway: { "09L": "IF09L", "09R": "IF09R" },
    terminalZones: [
      { label: "ASTERIA NORTH TERMINAL (CONCOURSE B & A)", x1: -0.48, y1: 0.58, x2: 0.46, y2: 0.50 },
      { label: "SOUTH CARGO / REGIONAL RAMP", x1: -0.36, y1: -0.525, x2: 0.64, y2: -0.59 },
    ],
    apronPolygons,
    terminalBuildings,
    controlTower: { x: 0.27, y: 0.59 },
    taxiwayChains: [
      { taxiway: "A", nodeIds: alphaChain },
      { taxiway: "F", nodeIds: foxtrotChain },
      { taxiway: "G", nodeIds: golfChain },
      ...colChains,
    ],
    taxiwayLabels: [
      { label: "A", x: -0.80, y: 0.355 },
      { label: "A", x: 0.64, y: 0.355 },
      { label: "B", x: -0.96, y: 0.08 },
      { label: "C", x: -0.47, y: 0.08 },
      { label: "D", x: 0.11, y: 0.08 },
      { label: "E", x: 0.62, y: 0.08 },
      { label: "H", x: 0.94, y: 0.08 },
      { label: "F", x: -0.22, y: 0.02 },
      { label: "G", x: -0.64, y: -0.35 },
    ],
  };
}

// =============================================================================
// 2. KMRD — Meridian Bay Coastal (Westbound 270° Twin-Parallel 27R / 27L)
// =============================================================================
export function createMeridianAirport(): AirportLayout {
  const { nodes, edges, addNode, addEdge } = makeGraphBuilder();
  const Y_27R = 0.20;
  const Y_27L = -0.20;
  const Y_ALPHA = 0.36;
  const Y_FOXTROT = 0.0;
  const Y_GOLF = -0.36;

  // Thresholds at East (+0.92), rolling West toward -0.70 / -0.92
  const cols: Array<{ col: "B" | "C" | "D" | "E" | "H"; x: number }> = [
    { col: "B", x: 0.92 },
    { col: "C", x: 0.54 },
    { col: "D", x: 0.02 },
    { col: "E", x: -0.54 },
    { col: "H", x: -0.70 },
  ];

  for (const { col, x } of cols) {
    const aId = `A_${col}`;
    const hs27RN = `HS_27R_${col}_N`;
    const rwy27R = `RWY_27R_${col}`;
    const hs27RS = `HS_27R_${col}_S`;
    const fId = `F_${col}`;
    const hs27LN = `HS_27L_${col}_N`;
    const rwy27L = `RWY_27L_${col}`;
    const hs27LS = `HS_27L_${col}_S`;
    const gId = `G_${col}`;

    addNode({ id: aId, x, y: Y_ALPHA, kind: "TAXIWAY", label: `A/${col}` });
    addNode({
      id: hs27RN,
      x,
      y: Y_27R + 0.06,
      kind: "HOLD_SHORT",
      label: `HS 27R (${col}N)`,
      holdShortForRunway: "27R",
      isNorthSide: true,
    });
    addNode({
      id: rwy27R,
      x,
      y: Y_27R,
      kind: col === "B" || col === "C" ? "RUNWAY_ENTRY" : "RUNWAY_EXIT",
      label: `27R/${col}`,
      runwayId: "27R",
    });
    addNode({
      id: hs27RS,
      x,
      y: Y_27R - 0.06,
      kind: "HOLD_SHORT",
      label: `HS 27R (${col}S)`,
      holdShortForRunway: "27R",
      isNorthSide: false,
    });
    addNode({ id: fId, x, y: Y_FOXTROT, kind: "TAXIWAY", label: `F/${col}` });
    addNode({
      id: hs27LN,
      x,
      y: Y_27L + 0.06,
      kind: "HOLD_SHORT",
      label: `HS 27L (${col}N)`,
      holdShortForRunway: "27L",
      isNorthSide: true,
    });
    addNode({
      id: rwy27L,
      x,
      y: Y_27L,
      kind: col === "B" || col === "C" ? "RUNWAY_ENTRY" : "RUNWAY_EXIT",
      label: `27L/${col}`,
      runwayId: "27L",
    });
    addNode({
      id: hs27LS,
      x,
      y: Y_27L - 0.06,
      kind: "HOLD_SHORT",
      label: `HS 27L (${col}S)`,
      holdShortForRunway: "27L",
      isNorthSide: false,
    });
    addNode({ id: gId, x, y: Y_GOLF, kind: "TAXIWAY", label: `G/${col}` });

    addEdge(aId, hs27RN, col);
    addEdge(hs27RN, rwy27R, col, "27R");
    addEdge(rwy27R, hs27RS, col, "27R");
    addEdge(hs27RS, fId, col);
    addEdge(fId, hs27LN, col);
    addEdge(hs27LN, rwy27L, col, "27L");
    addEdge(rwy27L, hs27LS, col, "27L");
    addEdge(hs27LS, gId, col);
  }

  // North Executive Apron (N1-N2)
  const northGates = [
    { gateId: "N1", x: 0.28 },
    { gateId: "N2", x: -0.26 },
  ];
  for (const g of northGates) {
    addNode({ id: `GATE_${g.gateId}`, x: g.x, y: 0.48, kind: "GATE", label: g.gateId, gateId: g.gateId, pairedSpotId: `PB_${g.gateId}`, isNorthSide: true });
    addNode({ id: `PB_${g.gateId}`, x: g.x, y: 0.41, kind: "PUSHBACK_SPOT", label: `Spot ${g.gateId}`, gateId: g.gateId, isNorthSide: true });
    addNode({ id: `A_${g.gateId}`, x: g.x, y: Y_ALPHA, kind: "TAXIWAY", label: `A/${g.gateId}`, isNorthSide: true });
    addEdge(`GATE_${g.gateId}`, `PB_${g.gateId}`, "APRON");
    addEdge(`PB_${g.gateId}`, `A_${g.gateId}`, "APRON");
  }
  const alphaChain = ["A_H", "A_E", "A_N2", "A_D", "A_N1", "A_C", "A_B"];
  for (let i = 0; i < alphaChain.length - 1; i++) addEdge(alphaChain[i], alphaChain[i + 1], "A");

  const foxtrotChain = ["F_H", "F_E", "F_D", "F_C", "F_B"];
  for (let i = 0; i < foxtrotChain.length - 1; i++) addEdge(foxtrotChain[i], foxtrotChain[i + 1], "F");

  // South Main Bay Terminal (T1-T5)
  const southGates = [
    { gateId: "T5", x: -0.40 },
    { gateId: "T4", x: -0.24 },
    { gateId: "T3", x: -0.10 },
    { gateId: "T2", x: 0.22 },
    { gateId: "T1", x: 0.38 },
  ];
  for (const g of southGates) {
    addNode({ id: `GATE_${g.gateId}`, x: g.x, y: -0.49, kind: "GATE", label: g.gateId, gateId: g.gateId, pairedSpotId: `PB_${g.gateId}`, isNorthSide: false });
    addNode({ id: `PB_${g.gateId}`, x: g.x, y: -0.42, kind: "PUSHBACK_SPOT", label: `Spot ${g.gateId}`, gateId: g.gateId, isNorthSide: false });
    addNode({ id: `G_${g.gateId}`, x: g.x, y: Y_GOLF, kind: "TAXIWAY", label: `G/${g.gateId}`, isNorthSide: false });
    addEdge(`GATE_${g.gateId}`, `PB_${g.gateId}`, "APRON");
    addEdge(`PB_${g.gateId}`, `G_${g.gateId}`, "APRON");
  }
  const golfChain = ["G_H", "G_E", "G_T5", "G_T4", "G_T3", "G_D", "G_T2", "G_T1", "G_C", "G_B"];
  for (let i = 0; i < golfChain.length - 1; i++) addEdge(golfChain[i], golfChain[i + 1], "G");

  const runways: Record<string, RunwaySpec> = {
    "27R": makeRunwaySpec({
      id: "27R",
      oppositeId: "09L",
      heading: 270,
      thresholdX: 0.92,
      thresholdY: Y_27R,
      lengthNm: 1.84,
      elevationFt: 18,
      entryNodeIds: ["RWY_27R_B", "RWY_27R_C"],
      exitNodeIds: ["RWY_27R_D", "RWY_27R_E", "RWY_27R_H"],
      crossingNodeIds: cols.map((c) => `RWY_27R_${c.col}`),
      holdShortNodeIds: cols.flatMap((c) => [`HS_27R_${c.col}_N`, `HS_27R_${c.col}_S`]),
    }),
    "27L": makeRunwaySpec({
      id: "27L",
      oppositeId: "09R",
      heading: 270,
      thresholdX: 0.92,
      thresholdY: Y_27L,
      lengthNm: 1.64,
      elevationFt: 18,
      entryNodeIds: ["RWY_27L_B", "RWY_27L_C"],
      exitNodeIds: ["RWY_27L_D", "RWY_27L_E", "RWY_27L_H"],
      crossingNodeIds: cols.map((c) => `RWY_27L_${c.col}`),
      holdShortNodeIds: cols.flatMap((c) => [`HS_27L_${c.col}_N`, `HS_27L_${c.col}_S`]),
    }),
  };

  const fixes: Record<string, NavFix> = {
    BAYER: { id: "BAYER", x: 11.5, y: 4.2, kind: "ARRIVAL", label: "BAYER (NE ARR)" },
    COAST: { id: "COAST", x: 11.5, y: -4.2, kind: "ARRIVAL", label: "COAST (SE ARR)" },
    IF27R: { id: "IF27R", x: 6.5, y: Y_27R, kind: "IAF", label: "IF27R (ILS 27R)" },
    IF27L: { id: "IF27L", x: 6.5, y: Y_27L, kind: "IAF", label: "IF27L (ILS 27L)" },
    PACIFIC: { id: "PACIFIC", x: -9.0, y: 4.2, kind: "DEPARTURE", label: "PACIFIC (NW DEP)" },
    OCEAN: { id: "OCEAN", x: -9.8, y: -0.2, kind: "DEPARTURE", label: "OCEAN (W DEP)" },
    WESTN1: { id: "WESTN1", x: -8.0, y: -4.6, kind: "DEPARTURE", label: "WESTN1 (SW DEP)" },
    MISSED: { id: "MISSED", x: -5.5, y: 1.8, kind: "MISSED", label: "MISSED (GA FIX)" },
  };

  return {
    id: "KMRD",
    icao: "KMRD",
    name: "Meridian Bay Coastal Airport",
    city: "Meridian Coast",
    controllerPrefix: "Meridian",
    difficulty: "INTERMEDIATE",
    description: "Westbound coastal operations (270°) with staggered asymmetric runways 27R & 27L.",
    windText: "270 at 12",
    windLabel: "WIND 270/12KT",
    elevationFt: 18,
    runwayIds: ["27R", "27L"],
    primaryDepartureRunway: "27L",
    primaryArrivalRunway: "27R",
    runways,
    nodes,
    edges,
    fixes,
    gateIds: ["T1", "T2", "T3", "T4", "T5", "N1", "N2"],
    arrivalFixIds: ["BAYER", "COAST"],
    departureFixIds: ["PACIFIC", "OCEAN", "WESTN1"],
    iafByRunway: { "27R": "IF27R", "27L": "IF27L" },
    terminalZones: [
      { label: "NORTH EXECUTIVE APRON", x1: -0.34, y1: 0.56, x2: 0.36, y2: 0.49 },
      { label: "MERIDIAN BAY MAIN TERMINAL (T1–T5)", x1: -0.48, y1: -0.51, x2: 0.46, y2: -0.58 },
    ],
    taxiwayLabels: [
      { label: "A", x: -0.28, y: 0.36 },
      { label: "B", x: 0.92, y: 0.06 },
      { label: "C", x: 0.54, y: 0.06 },
      { label: "D", x: 0.02, y: 0.06 },
      { label: "E", x: -0.54, y: 0.06 },
      { label: "H", x: -0.70, y: 0.06 },
      { label: "F", x: 0.28, y: 0.0 },
      { label: "G", x: 0.72, y: -0.36 },
    ],
  };
}

// =============================================================================
// 3. KVEL — Veloce Alpine Skyport (High-Altitude Single Shared Runway 09)
// =============================================================================
export function createVeloceAirport(): AirportLayout {
  const { nodes, edges, addNode, addEdge } = makeGraphBuilder();
  const Y_ALPHA = 0.22;
  const Y_GOLF = -0.22;

  const cols: Array<{ col: "B" | "C" | "D" | "E" | "H"; x: number }> = [
    { col: "B", x: -0.92 },
    { col: "C", x: -0.52 },
    { col: "D", x: 0.02 },
    { col: "E", x: 0.58 },
    { col: "H", x: 0.92 },
  ];

  for (const { col, x } of cols) {
    const aId = `A_${col}`;
    const hs09N = `HS_09_${col}_N`;
    const rwy09 = `RWY_09_${col}`;
    const hs09S = `HS_09_${col}_S`;
    const gId = `G_${col}`;

    addNode({ id: aId, x, y: Y_ALPHA, kind: "TAXIWAY", label: `A/${col}` });
    addNode({
      id: hs09N,
      x,
      y: 0.07,
      kind: "HOLD_SHORT",
      label: `HS 09 (${col}N)`,
      holdShortForRunway: "09",
      isNorthSide: true,
    });
    addNode({
      id: rwy09,
      x,
      y: 0,
      kind: col === "B" || col === "C" ? "RUNWAY_ENTRY" : "RUNWAY_EXIT",
      label: `09/${col}`,
      runwayId: "09",
    });
    addNode({
      id: hs09S,
      x,
      y: -0.07,
      kind: "HOLD_SHORT",
      label: `HS 09 (${col}S)`,
      holdShortForRunway: "09",
      isNorthSide: false,
    });
    addNode({ id: gId, x, y: Y_GOLF, kind: "TAXIWAY", label: `G/${col}` });

    addEdge(aId, hs09N, col);
    addEdge(hs09N, rwy09, col, "09");
    addEdge(rwy09, hs09S, col, "09");
    addEdge(hs09S, gId, col);
  }

  const northGates = [
    { gateId: "V1", x: -0.34 },
    { gateId: "V2", x: -0.16 },
    { gateId: "V3", x: 0.18 },
    { gateId: "V4", x: 0.36 },
  ];
  for (const g of northGates) {
    addNode({ id: `GATE_${g.gateId}`, x: g.x, y: 0.35, kind: "GATE", label: g.gateId, gateId: g.gateId, pairedSpotId: `PB_${g.gateId}`, isNorthSide: true });
    addNode({ id: `PB_${g.gateId}`, x: g.x, y: 0.28, kind: "PUSHBACK_SPOT", label: `Spot ${g.gateId}`, gateId: g.gateId, isNorthSide: true });
    addNode({ id: `A_${g.gateId}`, x: g.x, y: Y_ALPHA, kind: "TAXIWAY", label: `A/${g.gateId}`, isNorthSide: true });
    addEdge(`GATE_${g.gateId}`, `PB_${g.gateId}`, "APRON");
    addEdge(`PB_${g.gateId}`, `A_${g.gateId}`, "APRON");
  }
  const alphaChain = ["A_B", "A_C", "A_V1", "A_V2", "A_D", "A_V3", "A_V4", "A_E", "A_H"];
  for (let i = 0; i < alphaChain.length - 1; i++) addEdge(alphaChain[i], alphaChain[i + 1], "A");

  const southGates = [
    { gateId: "K1", x: -0.32 },
    { gateId: "K2", x: -0.14 },
    { gateId: "K3", x: 0.24 },
  ];
  for (const g of southGates) {
    addNode({ id: `GATE_${g.gateId}`, x: g.x, y: -0.35, kind: "GATE", label: g.gateId, gateId: g.gateId, pairedSpotId: `PB_${g.gateId}`, isNorthSide: false });
    addNode({ id: `PB_${g.gateId}`, x: g.x, y: -0.28, kind: "PUSHBACK_SPOT", label: `Spot ${g.gateId}`, gateId: g.gateId, isNorthSide: false });
    addNode({ id: `G_${g.gateId}`, x: g.x, y: Y_GOLF, kind: "TAXIWAY", label: `G/${g.gateId}`, isNorthSide: false });
    addEdge(`GATE_${g.gateId}`, `PB_${g.gateId}`, "APRON");
    addEdge(`PB_${g.gateId}`, `G_${g.gateId}`, "APRON");
  }
  const golfChain = ["G_B", "G_C", "G_K1", "G_K2", "G_D", "G_K3", "G_E", "G_H"];
  for (let i = 0; i < golfChain.length - 1; i++) addEdge(golfChain[i], golfChain[i + 1], "G");

  const runways: Record<string, RunwaySpec> = {
    "09": makeRunwaySpec({
      id: "09",
      oppositeId: "27",
      heading: 90,
      thresholdX: -0.92,
      thresholdY: 0,
      lengthNm: 1.84,
      elevationFt: 4280,
      entryNodeIds: ["RWY_09_B", "RWY_09_C"],
      exitNodeIds: ["RWY_09_D", "RWY_09_E", "RWY_09_H"],
      crossingNodeIds: cols.map((c) => `RWY_09_${c.col}`),
      holdShortNodeIds: cols.flatMap((c) => [`HS_09_${c.col}_N`, `HS_09_${c.col}_S`]),
    }),
  };

  const fixes: Record<string, NavFix> = {
    CREST: { id: "CREST", x: -11.5, y: 4.0, kind: "ARRIVAL", label: "CREST (NW ARR)" },
    RIDGE: { id: "RIDGE", x: -11.5, y: -4.0, kind: "ARRIVAL", label: "RIDGE (SW ARR)" },
    IF09: { id: "IF09", x: -6.5, y: 0, kind: "IAF", label: "IF09 (ILS 09)" },
    ALPINE1: { id: "ALPINE1", x: 8.5, y: 4.2, kind: "DEPARTURE", label: "ALPINE1 (NE DEP)" },
    SUMMIT: { id: "SUMMIT", x: 9.8, y: 0.0, kind: "DEPARTURE", label: "SUMMIT (E DEP)" },
    VALE: { id: "VALE", x: 7.8, y: -4.5, kind: "DEPARTURE", label: "VALE (SE DEP)" },
    MISSED: { id: "MISSED", x: 5.5, y: 1.8, kind: "MISSED", label: "MISSED (GA FIX)" },
  };

  return {
    id: "KVEL",
    icao: "KVEL",
    name: "Veloce Alpine Skyport",
    city: "Veloce Highlands",
    controllerPrefix: "Veloce",
    difficulty: "CHALLENGING",
    description: "High-altitude 4,280 ft single-runway airport (RWY 09). All arrivals & departures share one runway!",
    windText: "090 at 14",
    windLabel: "WIND 090/14KT",
    elevationFt: 4280,
    runwayIds: ["09"],
    primaryDepartureRunway: "09",
    primaryArrivalRunway: "09",
    runways,
    nodes,
    edges,
    fixes,
    gateIds: ["V1", "V2", "V3", "V4", "K1", "K2", "K3"],
    arrivalFixIds: ["CREST", "RIDGE"],
    departureFixIds: ["ALPINE1", "SUMMIT", "VALE"],
    iafByRunway: { "09": "IF09" },
    terminalZones: [
      { label: "VELOCE ALPINE TERMINAL (V1–V4)", x1: -0.44, y1: 0.44, x2: 0.44, y2: 0.37 },
      { label: "SOUTH REGIONAL HANGARS (K1–K3)", x1: -0.42, y1: -0.37, x2: 0.34, y2: -0.44 },
    ],
    taxiwayLabels: [
      { label: "A", x: -0.72, y: 0.22 },
      { label: "B", x: -0.92, y: 0.14 },
      { label: "C", x: -0.52, y: 0.14 },
      { label: "D", x: 0.02, y: 0.14 },
      { label: "E", x: 0.58, y: 0.14 },
      { label: "H", x: 0.92, y: 0.14 },
      { label: "G", x: -0.72, y: -0.22 },
    ],
  };
}

// =============================================================================
// 4. KSOL — Solaris Mega-Hub (Midfield Terminal Island + 080° Parallel 08L/08R)
// =============================================================================
export function createSolarisAirport(): AirportLayout {
  const { nodes, edges, addNode, addEdge } = makeGraphBuilder();
  const hdg = 80;
  const rad = (hdg * Math.PI) / 180;
  const ux = Math.sin(rad);
  const uy = Math.cos(rad);
  const rot = (lx: number, ly: number) => ({
    x: lx * ux + ly * -uy,
    y: lx * uy + ly * ux,
  });

  const LY_08L = 0.28;
  const LY_08R = -0.28;
  const LY_ALPHA = 0.44;
  const LY_CHARLIE = 0.12;
  const LY_FOXTROT = -0.12;
  const LY_GOLF = -0.44;

  const cols: Array<{ col: "B" | "D" | "E" | "H" | "J"; lx: number }> = [
    { col: "B", lx: -0.92 },
    { col: "D", lx: -0.48 },
    { col: "E", lx: 0.12 },
    { col: "H", lx: 0.62 },
    { col: "J", lx: 0.92 },
  ];

  for (const { col, lx } of cols) {
    const pA = rot(lx, LY_ALPHA);
    const pHsLN = rot(lx, LY_08L + 0.06);
    const pRwyL = rot(lx, LY_08L);
    const pHsLS = rot(lx, LY_08L - 0.06);
    const pC = rot(lx, LY_CHARLIE);
    const pF = rot(lx, LY_FOXTROT);
    const pHsRN = rot(lx, LY_08R + 0.06);
    const pRwyR = rot(lx, LY_08R);
    const pHsRS = rot(lx, LY_08R - 0.06);
    const pG = rot(lx, LY_GOLF);

    addNode({ id: `A_${col}`, x: pA.x, y: pA.y, kind: "TAXIWAY", label: `A/${col}` });
    addNode({ id: `HS_08L_${col}_N`, x: pHsLN.x, y: pHsLN.y, kind: "HOLD_SHORT", label: `HS 08L (${col}N)`, holdShortForRunway: "08L", isNorthSide: true });
    addNode({ id: `RWY_08L_${col}`, x: pRwyL.x, y: pRwyL.y, kind: col === "B" || col === "D" ? "RUNWAY_ENTRY" : "RUNWAY_EXIT", label: `08L/${col}`, runwayId: "08L" });
    addNode({ id: `HS_08L_${col}_S`, x: pHsLS.x, y: pHsLS.y, kind: "HOLD_SHORT", label: `HS 08L (${col}S)`, holdShortForRunway: "08L", isNorthSide: false });
    addNode({ id: `C_${col}`, x: pC.x, y: pC.y, kind: "TAXIWAY", label: `C/${col}` });
    addNode({ id: `F_${col}`, x: pF.x, y: pF.y, kind: "TAXIWAY", label: `F/${col}` });
    addNode({ id: `HS_08R_${col}_N`, x: pHsRN.x, y: pHsRN.y, kind: "HOLD_SHORT", label: `HS 08R (${col}N)`, holdShortForRunway: "08R", isNorthSide: true });
    addNode({ id: `RWY_08R_${col}`, x: pRwyR.x, y: pRwyR.y, kind: col === "B" || col === "D" ? "RUNWAY_ENTRY" : "RUNWAY_EXIT", label: `08R/${col}`, runwayId: "08R" });
    addNode({ id: `HS_08R_${col}_S`, x: pHsRS.x, y: pHsRS.y, kind: "HOLD_SHORT", label: `HS 08R (${col}S)`, holdShortForRunway: "08R", isNorthSide: false });
    addNode({ id: `G_${col}`, x: pG.x, y: pG.y, kind: "TAXIWAY", label: `G/${col}` });

    addEdge(`A_${col}`, `HS_08L_${col}_N`, col);
    addEdge(`HS_08L_${col}_N`, `RWY_08L_${col}`, col, "08L");
    addEdge(`RWY_08L_${col}`, `HS_08L_${col}_S`, col, "08L");
    addEdge(`HS_08L_${col}_S`, `C_${col}`, col);
    addEdge(`C_${col}`, `F_${col}`, col);
    addEdge(`F_${col}`, `HS_08R_${col}_N`, col);
    addEdge(`HS_08R_${col}_N`, `RWY_08R_${col}`, col, "08R");
    addEdge(`RWY_08R_${col}`, `HS_08R_${col}_S`, col, "08R");
    addEdge(`HS_08R_${col}_S`, `G_${col}`, col);
  }

  // Midfield Island Gates M1-M3 pushing onto Charlie (North side of island)
  const midfieldNorth = [
    { gateId: "M1", lx: -0.28 },
    { gateId: "M2", lx: -0.06 },
    { gateId: "M3", lx: 0.34 },
  ];
  for (const g of midfieldNorth) {
    const pg = rot(g.lx, 0.02);
    const pb = rot(g.lx, 0.075);
    const pc = rot(g.lx, LY_CHARLIE);
    addNode({ id: `GATE_${g.gateId}`, x: pg.x, y: pg.y, kind: "GATE", label: g.gateId, gateId: g.gateId, pairedSpotId: `PB_${g.gateId}`, isNorthSide: true });
    addNode({ id: `PB_${g.gateId}`, x: pb.x, y: pb.y, kind: "PUSHBACK_SPOT", label: `Spot ${g.gateId}`, gateId: g.gateId, isNorthSide: true });
    addNode({ id: `C_${g.gateId}`, x: pc.x, y: pc.y, kind: "TAXIWAY", label: `C/${g.gateId}`, isNorthSide: true });
    addEdge(`GATE_${g.gateId}`, `PB_${g.gateId}`, "APRON");
    addEdge(`PB_${g.gateId}`, `C_${g.gateId}`, "APRON");
  }
  const cChain = ["C_B", "C_D", "C_M1", "C_M2", "C_E", "C_M3", "C_H", "C_J"];
  for (let i = 0; i < cChain.length - 1; i++) addEdge(cChain[i], cChain[i + 1], "C");

  // Midfield Island Gates M4-M5 pushing onto Foxtrot (South side of island)
  const midfieldSouth = [
    { gateId: "M4", lx: -0.18 },
    { gateId: "M5", lx: 0.40 },
  ];
  for (const g of midfieldSouth) {
    const pg = rot(g.lx, -0.02);
    const pb = rot(g.lx, -0.075);
    const pf = rot(g.lx, LY_FOXTROT);
    addNode({ id: `GATE_${g.gateId}`, x: pg.x, y: pg.y, kind: "GATE", label: g.gateId, gateId: g.gateId, pairedSpotId: `PB_${g.gateId}`, isNorthSide: false });
    addNode({ id: `PB_${g.gateId}`, x: pb.x, y: pb.y, kind: "PUSHBACK_SPOT", label: `Spot ${g.gateId}`, gateId: g.gateId, isNorthSide: false });
    addNode({ id: `F_${g.gateId}`, x: pf.x, y: pf.y, kind: "TAXIWAY", label: `F/${g.gateId}`, isNorthSide: false });
    addEdge(`GATE_${g.gateId}`, `PB_${g.gateId}`, "APRON");
    addEdge(`PB_${g.gateId}`, `F_${g.gateId}`, "APRON");
  }
  const fChain = ["F_B", "F_D", "F_M4", "F_E", "F_M5", "F_H", "F_J"];
  for (let i = 0; i < fChain.length - 1; i++) addEdge(fChain[i], fChain[i + 1], "F");

  // Outer North Cargo (N1-N2 along Alpha)
  const northGates = [
    { gateId: "N1", lx: -0.22 },
    { gateId: "N2", lx: 0.34 },
  ];
  for (const g of northGates) {
    const pg = rot(g.lx, 0.56);
    const pb = rot(g.lx, 0.49);
    const pa = rot(g.lx, LY_ALPHA);
    addNode({ id: `GATE_${g.gateId}`, x: pg.x, y: pg.y, kind: "GATE", label: g.gateId, gateId: g.gateId, pairedSpotId: `PB_${g.gateId}`, isNorthSide: true });
    addNode({ id: `PB_${g.gateId}`, x: pb.x, y: pb.y, kind: "PUSHBACK_SPOT", label: `Spot ${g.gateId}`, gateId: g.gateId, isNorthSide: true });
    addNode({ id: `A_${g.gateId}`, x: pa.x, y: pa.y, kind: "TAXIWAY", label: `A/${g.gateId}`, isNorthSide: true });
    addEdge(`GATE_${g.gateId}`, `PB_${g.gateId}`, "APRON");
    addEdge(`PB_${g.gateId}`, `A_${g.gateId}`, "APRON");
  }
  const aChain = ["A_B", "A_D", "A_N1", "A_E", "A_N2", "A_H", "A_J"];
  for (let i = 0; i < aChain.length - 1; i++) addEdge(aChain[i], aChain[i + 1], "A");

  // Outer South Apron (S1-S2 along Golf)
  const southGates = [
    { gateId: "S1", lx: -0.22 },
    { gateId: "S2", lx: 0.34 },
  ];
  for (const g of southGates) {
    const pg = rot(g.lx, -0.56);
    const pb = rot(g.lx, -0.49);
    const pG = rot(g.lx, LY_GOLF);
    addNode({ id: `GATE_${g.gateId}`, x: pg.x, y: pg.y, kind: "GATE", label: g.gateId, gateId: g.gateId, pairedSpotId: `PB_${g.gateId}`, isNorthSide: false });
    addNode({ id: `PB_${g.gateId}`, x: pb.x, y: pb.y, kind: "PUSHBACK_SPOT", label: `Spot ${g.gateId}`, gateId: g.gateId, isNorthSide: false });
    addNode({ id: `G_${g.gateId}`, x: pG.x, y: pG.y, kind: "TAXIWAY", label: `G/${g.gateId}`, isNorthSide: false });
    addEdge(`GATE_${g.gateId}`, `PB_${g.gateId}`, "APRON");
    addEdge(`PB_${g.gateId}`, `G_${g.gateId}`, "APRON");
  }
  const gChain = ["G_B", "G_D", "G_S1", "G_E", "G_S2", "G_H", "G_J"];
  for (let i = 0; i < gChain.length - 1; i++) addEdge(gChain[i], gChain[i + 1], "G");

  const t08L = rot(-0.92, LY_08L);
  const t08R = rot(-0.92, LY_08R);
  const r08L = makeRunwaySpec({
    id: "08L",
    oppositeId: "26R",
    heading: 80,
    thresholdX: t08L.x,
    thresholdY: t08L.y,
    lengthNm: 1.84,
    elevationFt: 110,
    entryNodeIds: ["RWY_08L_B", "RWY_08L_D"],
    exitNodeIds: ["RWY_08L_E", "RWY_08L_H", "RWY_08L_J"],
    crossingNodeIds: cols.map((c) => `RWY_08L_${c.col}`),
    holdShortNodeIds: cols.flatMap((c) => [`HS_08L_${c.col}_N`, `HS_08L_${c.col}_S`]),
  });
  const r08R = makeRunwaySpec({
    id: "08R",
    oppositeId: "26L",
    heading: 80,
    thresholdX: t08R.x,
    thresholdY: t08R.y,
    lengthNm: 1.84,
    elevationFt: 110,
    entryNodeIds: ["RWY_08R_B", "RWY_08R_D"],
    exitNodeIds: ["RWY_08R_E", "RWY_08R_H", "RWY_08R_J"],
    crossingNodeIds: cols.map((c) => `RWY_08R_${c.col}`),
    holdShortNodeIds: cols.flatMap((c) => [`HS_08R_${c.col}_N`, `HS_08R_${c.col}_S`]),
  });

  const if08L = runwayPoint(r08L, -6.5, 0);
  const if08R = runwayPoint(r08R, -6.5, 0);
  const missedPt = runwayPoint(r08L, 5.5, 1.5);

  const fixes: Record<string, NavFix> = {
    ZEPHYR: { id: "ZEPHYR", x: -11.2, y: 2.8, kind: "ARRIVAL", label: "ZEPHYR (NW ARR)" },
    SOLAR1: { id: "SOLAR1", x: -10.5, y: -5.2, kind: "ARRIVAL", label: "SOLAR1 (SW ARR)" },
    IF08L: { id: "IF08L", x: if08L.x, y: if08L.y, kind: "IAF", label: "IF08L (ILS 08L)" },
    IF08R: { id: "IF08R", x: if08R.x, y: if08R.y, kind: "IAF", label: "IF08R (ILS 08R)" },
    ATLAS1: { id: "ATLAS1", x: 7.6, y: 5.8, kind: "DEPARTURE", label: "ATLAS1 (NE DEP)" },
    ORION: { id: "ORION", x: 9.6, y: 1.7, kind: "DEPARTURE", label: "ORION (E DEP)" },
    HORIZN: { id: "HORIZN", x: 8.2, y: -3.5, kind: "DEPARTURE", label: "HORIZN (SE DEP)" },
    MISSED: { id: "MISSED", x: missedPt.x, y: missedPt.y, kind: "MISSED", label: "MISSED (GA FIX)" },
  };

  const lblPositions = [
    { label: "A", p: rot(-0.70, LY_ALPHA) },
    { label: "B", p: rot(-0.92, 0.0) },
    { label: "C", p: rot(-0.70, LY_CHARLIE) },
    { label: "D", p: rot(-0.48, 0.18) },
    { label: "E", p: rot(0.12, 0.18) },
    { label: "F", p: rot(-0.70, LY_FOXTROT) },
    { label: "G", p: rot(-0.70, LY_GOLF) },
    { label: "H", p: rot(0.62, 0.18) },
    { label: "J", p: rot(0.92, 0.0) },
  ];

  return {
    id: "KSOL",
    icao: "KSOL",
    name: "Solaris Mega-Hub Airport",
    city: "Solaris Valley",
    controllerPrefix: "Solaris",
    difficulty: "EXPERT",
    description: "Midfield terminal island flanked by angled 080° heavy runways 08L & 08R with dual center taxiways.",
    windText: "080 at 10",
    windLabel: "WIND 080/10KT",
    elevationFt: 110,
    runwayIds: ["08L", "08R"],
    primaryDepartureRunway: "08L",
    primaryArrivalRunway: "08R",
    runways: { "08L": r08L, "08R": r08R },
    nodes,
    edges,
    fixes,
    gateIds: ["M1", "M2", "M3", "M4", "M5", "N1", "N2", "S1", "S2"],
    arrivalFixIds: ["ZEPHYR", "SOLAR1"],
    departureFixIds: ["ATLAS1", "ORION", "HORIZN"],
    iafByRunway: { "08L": "IF08L", "08R": "IF08R" },
    terminalZones: [
      { label: "MIDFIELD ISLAND TERMINAL (M1–M5)", x1: -0.34, y1: 0.015, x2: 0.46, y2: -0.015, angleDeg: 10 },
    ],
    taxiwayLabels: lblPositions.map((l) => ({ label: l.label, x: l.p.x, y: l.p.y })),
  };
}

export function createAirportById(airportId: AirportId): AirportLayout {
  switch (airportId) {
    case "KAST":
      return createAsteriaAirport();
    case "KMRD":
      return createMeridianAirport();
    case "KVEL":
      return createVeloceAirport();
    case "KSOL":
      return createSolarisAirport();
  }
}

export const AIRPORT_CATALOG: AirportSummary[] = (["KAST", "KMRD", "KVEL", "KSOL"] as AirportId[]).map(
  (id) => {
    const a = createAirportById(id);
    return {
      id: a.id,
      icao: a.icao,
      name: a.name,
      city: a.city,
      difficulty: a.difficulty,
      runwaySummary: a.runwayIds.join(" / "),
      elevationFt: a.elevationFt,
      windLabel: a.windLabel,
      description: a.description,
    };
  }
);

/**
 * Finds a taxiway route between two nodes that strictly respects the ordered sequence
 * of assigned taxiways (e.g. ["A", "B"] goes Alpha -> Bravo, NEVER Alpha -> Charlie).
 * APRON edges are permitted only when departing from or arriving at a GATE/PUSHBACK_SPOT.
 */
export function findRouteAlongTaxiways(
  airport: AirportLayout,
  startNodeId: string,
  destinationNodeId: string,
  routeTaxiways: TaxiwayName[]
): string[] | null {
  if (!airport.nodes[startNodeId] || !airport.nodes[destinationNodeId]) {
    return null;
  }
  if (startNodeId === destinationNodeId) {
    return [startNodeId];
  }
  if (routeTaxiways.length === 0) {
    return null;
  }

  interface SearchState {
    nodeId: string;
    phase: number;
    path: string[];
  }

  const queue: SearchState[] = [{ nodeId: startNodeId, phase: -1, path: [startNodeId] }];
  const visited = new Set<string>([`${startNodeId}|-1`]);

  const startNode = airport.nodes[startNodeId];
  if (startNode.kind !== "GATE" && startNode.kind !== "PUSHBACK_SPOT") {
    queue[0].phase = 0;
    visited.add(`${startNodeId}|0`);
  }

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.nodeId === destinationNodeId && cur.phase >= 0) {
      return cur.path;
    }

    const outgoing = airport.edges.filter((e) => e.from === cur.nodeId);
    for (const edge of outgoing) {
      if (cur.path.includes(edge.to)) continue;

      const nextPhases: number[] = [];

      if (cur.phase === -1) {
        if (edge.taxiway === "APRON") {
          nextPhases.push(-1);
        } else if (edge.taxiway === routeTaxiways[0]) {
          nextPhases.push(0);
        }
      } else if (cur.phase < routeTaxiways.length) {
        if (edge.taxiway === routeTaxiways[cur.phase]) {
          nextPhases.push(cur.phase);
        }
        if (
          cur.phase + 1 < routeTaxiways.length &&
          edge.taxiway === routeTaxiways[cur.phase + 1]
        ) {
          nextPhases.push(cur.phase + 1);
        }
        if (cur.phase === routeTaxiways.length - 1 && edge.taxiway === "APRON") {
          nextPhases.push(routeTaxiways.length);
        }
      } else if (cur.phase === routeTaxiways.length) {
        if (edge.taxiway === "APRON") {
          nextPhases.push(routeTaxiways.length);
        }
      }

      for (const np of nextPhases) {
        const key = `${edge.to}|${np}`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push({
            nodeId: edge.to,
            phase: np,
            path: [...cur.path, edge.to],
          });
        }
      }
    }
  }

  return null;
}

function getAdjacentTaxiway(airport: AirportLayout, nodeId: string): TaxiwayName | null {
  const visited = new Set<string>([nodeId]);
  const q = [nodeId];
  while (q.length > 0) {
    const cur = q.shift()!;
    for (const e of airport.edges) {
      if (e.from !== cur) continue;
      if (e.taxiway !== "APRON") return e.taxiway;
      if (!visited.has(e.to)) {
        visited.add(e.to);
        q.push(e.to);
      }
    }
  }
  return null;
}

function extractTaxiwaySequence(airport: AirportLayout, nodeIds: string[]): TaxiwayName[] {
  const seq: TaxiwayName[] = [];
  for (let i = 0; i < nodeIds.length - 1; i++) {
    const edge = airport.edges.find((e) => e.from === nodeIds[i] && e.to === nodeIds[i + 1]);
    if (!edge || edge.taxiway === "APRON") continue;
    if (seq[seq.length - 1] !== edge.taxiway) {
      seq.push(edge.taxiway);
    }
  }
  return seq;
}

function findShortestTaxiwayPath(
  airport: AirportLayout,
  startNodeId: string,
  destNodeId: string,
  avoidRunwayEntryIds?: Set<string>
): string[] | null {
  if (!airport.nodes[startNodeId] || !airport.nodes[destNodeId]) return null;
  interface Item {
    nodeId: string;
    path: string[];
    crossings: number;
  }
  const q: Item[] = [{ nodeId: startNodeId, path: [startNodeId], crossings: 0 }];
  const bestCrossings = new Map<string, number>([[startNodeId, 0]]);

  let bestSolution: Item | null = null;
  while (q.length > 0) {
    // Prefer fewest runway crossings, then shortest hops
    q.sort((a, b) => a.crossings - b.crossings || a.path.length - b.path.length);
    const cur = q.shift()!;
    if (cur.nodeId === destNodeId) {
      bestSolution = cur;
      break;
    }
    for (const e of airport.edges) {
      if (e.from !== cur.nodeId) continue;
      if (cur.path.includes(e.to)) continue;
      if (avoidRunwayEntryIds?.has(e.to) && e.to !== destNodeId) continue;
      const nextCrossings = cur.crossings + (e.runwayCrossing ? 1 : 0);
      const prevBest = bestCrossings.get(e.to);
      if (prevBest !== undefined && prevBest < nextCrossings) continue;
      bestCrossings.set(e.to, nextCrossings);
      q.push({ nodeId: e.to, path: [...cur.path, e.to], crossings: nextCrossings });
    }
  }
  return bestSolution ? bestSolution.path : null;
}

export function getSuggestedTaxiRoutes(
  airport: AirportLayout,
  aircraftNodeId: string,
  targetRunway: RunwayId,
  gateId?: string,
  isArrivalToGate = false
): Array<{
  label: string;
  taxiways: TaxiwayName[];
  destinationNodeId: string;
  nodeIds: string[];
}> {
  const options: Array<{
    label: string;
    taxiways: TaxiwayName[];
    destinationNodeId: string;
    nodeIds: string[];
  }> = [];
  const seen = new Set<string>();

  const pushOption = (label: string, taxiways: TaxiwayName[], destinationNodeId: string) => {
    const key = `${destinationNodeId}|${taxiways.join(",")}`;
    if (seen.has(key) || taxiways.length === 0) return;
    const nodeIds = findRouteAlongTaxiways(airport, aircraftNodeId, destinationNodeId, taxiways);
    if (nodeIds && nodeIds.length > 0) {
      seen.add(key);
      options.push({ label, taxiways, destinationNodeId, nodeIds });
    }
  };

  if (isArrivalToGate && gateId) {
    const dest = `GATE_${gateId}`;
    const startTw = getAdjacentTaxiway(airport, aircraftNodeId);
    const gateTw = getAdjacentTaxiway(airport, dest);

    if (startTw && gateTw) {
      pushOption(`Gate ${gateId} via ${[startTw, gateTw].map(taxiwayFullName).join(", ")}`, [startTw, gateTw], dest);
    }

    const shortest = findShortestTaxiwayPath(airport, aircraftNodeId, dest);
    if (shortest) {
      const seq = extractTaxiwaySequence(airport, shortest);
      pushOption(`Gate ${gateId} via ${seq.map(taxiwayFullName).join(", ")}`, seq, dest);
    }

    const fallbackSeqs: TaxiwayName[][] = [
      ["E", "A"],
      ["E", "G"],
      ["D", "A"],
      ["D", "G"],
      ["H", "A"],
      ["H", "G"],
      ["E", "C"],
      ["E", "F"],
      ["E", "F", "D", "A"],
      ["D", "F", "C", "A"],
    ];
    for (const seq of fallbackSeqs) {
      pushOption(`Gate ${gateId} via ${seq.map(taxiwayFullName).join(", ")}`, seq, dest);
    }
    return options;
  }

  // Departure routes to targetRunway entry hold-shorts
  const rwy = airport.runways[targetRunway];
  if (!rwy) return options;

  const startTw = getAdjacentTaxiway(airport, aircraftNodeId);
  const startNode = airport.nodes[aircraftNodeId];
  const preferNorth = startNode?.isNorthSide !== false;

  // Gather hold-short nodes directly connected to runway entry nodes
  const candidateTargets: Array<{ hsId: string; conn: TaxiwayName; distStart: number }> = [];
  for (const entryId of rwy.entryNodeIds) {
    for (const e of airport.edges) {
      if (e.from !== entryId || e.taxiway === "APRON") continue;
      const hs = airport.nodes[e.to];
      if (!hs || hs.kind !== "HOLD_SHORT" || hs.holdShortForRunway !== targetRunway) continue;
      candidateTargets.push({
        hsId: hs.id,
        conn: e.taxiway,
        distStart: hs.isNorthSide === preferNorth ? 0 : 1,
      });
    }
  }
  candidateTargets.sort((a, b) => a.distStart - b.distStart);

  for (const { hsId, conn } of candidateTargets) {
    if (startTw) {
      const twSeq: TaxiwayName[] = startTw === conn ? [conn] : [startTw, conn];
      pushOption(`RWY ${targetRunway} via ${twSeq.map(taxiwayFullName).join(", ")}`, twSeq, hsId);
    }
    const shortest = findShortestTaxiwayPath(airport, aircraftNodeId, hsId);
    if (shortest) {
      const seq = extractTaxiwaySequence(airport, shortest);
      pushOption(`RWY ${targetRunway} via ${seq.map(taxiwayFullName).join(", ")}`, seq, hsId);
    }
  }

  return options;
}

export function taxiwayFullName(tw: TaxiwayName): string {
  if (tw === "APRON") return "Apron";
  return ICAO_LETTER_MAP[tw] ?? tw;
}

export function runwaySpokenName(rwy: RunwayId): string {
  const clean = rwy.trim().toUpperCase();
  const suffix = clean.endsWith("L")
    ? " left"
    : clean.endsWith("R")
    ? " right"
    : clean.endsWith("C")
    ? " center"
    : "";
  const digits = suffix ? clean.slice(0, -1) : clean;
  return `${spellDigitsIcao(digits, false)}${suffix}`;
}
