import {
  alongRunwayNm,
  crossTrackRunwayNm,
  runwayPoint,
} from "../data/asteriaAirport.ts";
import type {
  AirportLayout,
  AirportRecord,
  AirportTaxiwayChain,
  AirportTerminalBuilding,
  AirportVisualTaxiway,
  NavFix,
  RunwayId,
  RunwaySpec,
  TaxiEdge,
  TaxiNode,
  TaxiwayName,
} from "../types/atc.ts";
import { bearingBetweenLatLon, haversineNm, latLonToLocalNm } from "./geo.ts";

function mergeContinuousVisualTaxiways(
  segments: AirportVisualTaxiway[]
): AirportVisualTaxiway[] {
  const SNAP = 0.0004; // ~2.4 ft exact OSM shared node tolerance
  const used = new Array<boolean>(segments.length).fill(false);
  const merged: AirportVisualTaxiway[] = [];

  const ptEq = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y) <= SNAP;

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const tw = segments[i].taxiway;
    const pts = [...segments[i].points];

    let extended = true;
    while (extended) {
      extended = false;
      const head = pts[0];
      const tail = pts[pts.length - 1];
      for (let j = 0; j < segments.length; j++) {
        if (used[j] || segments[j].taxiway !== tw) continue;
        const cand = segments[j].points;
        const cHead = cand[0];
        const cTail = cand[cand.length - 1];

        if (ptEq(tail, cHead)) {
          pts.push(...cand.slice(1));
          used[j] = true;
          extended = true;
          break;
        } else if (ptEq(tail, cTail)) {
          pts.push(...[...cand].reverse().slice(1));
          used[j] = true;
          extended = true;
          break;
        } else if (ptEq(head, cTail)) {
          pts.unshift(...cand.slice(0, -1));
          used[j] = true;
          extended = true;
          break;
        } else if (ptEq(head, cHead)) {
          pts.unshift(...[...cand].reverse().slice(0, -1));
          used[j] = true;
          extended = true;
          break;
        }
      }
    }

    merged.push({ taxiway: tw, points: pts });
  }

  return merged;
}

function makeRunway(opts: {
  id: RunwayId;
  oppositeId: string;
  heading: number;
  thresholdX: number;
  thresholdY: number;
  lengthNm: number;
  widthNm: number;
  elevationFt: number;
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
    widthNm: opts.widthNm,
    elevationFt: opts.elevationFt,
    entryNodeIds: [],
    exitNodeIds: [],
    crossingNodeIds: [],
    holdShortNodeIds: [],
  };
}

function headingFromIdent(ident: string): number {
  const digits = parseInt(ident.replace(/\D/g, ""), 10);
  if (!Number.isFinite(digits) || digits <= 0) return 90;
  return ((digits * 10) % 360) || 360;
}

/**
 * Converts a real-world AirportRecord (OurAirports metadata/runways + optional OSM/edited GeoJSON)
 * into a unified, simulation-ready AirportLayout anchored at (0,0) NM = (record.lat, record.lon).
 */
export function convertAirportBundleToLayout(record: AirportRecord): AirportLayout {
  const nodes: Record<string, TaxiNode> = {};
  const edges: TaxiEdge[] = [];
  const edgeKeys = new Set<string>();

  const addNode = (n: TaxiNode) => {
    nodes[n.id] = n;
  };
  const addEdge = (from: string, to: string, tw: TaxiwayName, runwayCrossing?: RunwayId) => {
    if (from === to) return;
    const k1 = `${from}__${to}`;
    const k2 = `${to}__${from}`;
    if (!edgeKeys.has(k1)) {
      edgeKeys.add(k1);
      edges.push({ id: `${k1}__${tw}`, from, to, taxiway: tw, runwayCrossing });
    }
    if (!edgeKeys.has(k2)) {
      edgeKeys.add(k2);
      edges.push({ id: `${k2}__${tw}`, from: to, to: from, taxiway: tw, runwayCrossing });
    }
  };

  // 1. Build Runways from authoritative OurAirports records + GeoJSON overrides if edited
  const runways: Record<string, RunwaySpec> = {};
  const runwayIds: RunwayId[] = [];
  const validRawRunways = (record.runways ?? []).filter((r) => !r.closed && (r.leIdent || r.heIdent));

  // If user added/edited runway features in GeoJSON, integrate them cleanly
  const geoRunwayFeatures = (record.geoJson?.features ?? []).filter(
    (f) => f.properties.aeroway === "runway" && f.geometry.type === "LineString"
  );

  if (validRawRunways.length > 0) {
    for (let idx = 0; idx < Math.min(4, validRawRunways.length); idx++) {
      const r = validRawRunways[idx];
      const id = (r.leIdent || `RWY${idx + 1}`).toUpperCase();
      const oppositeId = (r.heIdent || "").toUpperCase() || String(((Math.round(headingFromIdent(id) / 10) + 18 - 1) % 36) + 1).padStart(2, "0");

      let thresholdX = 0;
      let thresholdY = 0;
      let heading = r.leHeadingDegT ?? headingFromIdent(id);
      let lengthNm = Math.max(0.4, (r.lengthFt || 8000) / 6076.12);
      const widthNm = Math.max(0.025, (r.widthFt || 148) / 6076.12);

      if (r.leLat !== undefined && r.leLon !== undefined && r.heLat !== undefined && r.heLon !== undefined) {
        const lePt = latLonToLocalNm(r.leLat, r.leLon, record.lat, record.lon);
        const hePt = latLonToLocalNm(r.heLat, r.heLon, record.lat, record.lon);
        thresholdX = lePt.x;
        thresholdY = lePt.y;
        heading = bearingBetweenLatLon(r.leLat, r.leLon, r.heLat, r.heLon);
        lengthNm = Math.max(0.4, haversineNm(r.leLat, r.leLon, r.heLat, r.heLon));
      } else {
        const rad = (heading * Math.PI) / 180;
        const ux = Math.sin(rad);
        const uy = Math.cos(rad);
        const offsetCross = (idx - (Math.min(4, validRawRunways.length) - 1) / 2) * 0.25;
        thresholdX = (-lengthNm / 2) * ux + offsetCross * -uy;
        thresholdY = (-lengthNm / 2) * uy + offsetCross * ux;
      }

      if (!runways[id]) {
        runways[id] = makeRunway({
          id,
          oppositeId,
          heading,
          thresholdX,
          thresholdY,
          lengthNm,
          widthNm,
          elevationFt: record.elevationFt,
        });
        runwayIds.push(id);
      }
    }
  } else if (geoRunwayFeatures.length > 0) {
    geoRunwayFeatures.forEach((gf, idx) => {
      const coords = gf.geometry.coordinates as Array<[number, number]>;
      if (coords.length < 2) return;
      const [lon1, lat1] = coords[0];
      const [lon2, lat2] = coords[coords.length - 1];
      const p1 = latLonToLocalNm(lat1, lon1, record.lat, record.lon);
      const heading = bearingBetweenLatLon(lat1, lon1, lat2, lon2);
      const lengthNm = Math.max(0.4, haversineNm(lat1, lon1, lat2, lon2));
      const rawRef = String(gf.properties.ref || `0${idx + 1}L`).split("/")[0].trim().toUpperCase();
      const id = rawRef || `RWY${idx + 1}`;
      const oppositeId =
        String(gf.properties.ref || "").split("/")[1]?.trim().toUpperCase() ||
        String(((Math.round(heading / 10) + 18 - 1) % 36) + 1).padStart(2, "0");
      if (!runways[id]) {
        runways[id] = makeRunway({
          id,
          oppositeId,
          heading,
          thresholdX: p1.x,
          thresholdY: p1.y,
          lengthNm,
          widthNm: 0.036,
          elevationFt: record.elevationFt,
        });
        runwayIds.push(id);
      }
    });
  }

  // Fallback only if dataset had literally zero runway records
  if (runwayIds.length === 0) {
    runways["09"] = makeRunway({
      id: "09",
      oppositeId: "27",
      heading: 90,
      thresholdX: -0.9,
      thresholdY: 0,
      lengthNm: 1.8,
      widthNm: 0.036,
      elevationFt: record.elevationFt,
    });
    runwayIds.push("09");
  }

  const primaryDepRwyId = runwayIds[0];
  const primaryArrRwyId = runwayIds[1] ?? runwayIds[0];
  const primaryRwy = runways[primaryDepRwyId];

  // 2. Parse Real OSM GeoJSON Infrastructure (Taxiways, Aprons, Terminals, Gates, Tower)
  const apronPolygons: Array<Array<{ x: number; y: number }>> = [];
  const terminalBuildings: AirportTerminalBuilding[] = [];
  const taxiwayChains: AirportTaxiwayChain[] = [];
  const rawVisualSegments: AirportVisualTaxiway[] = [];
  const taxiwayLabels: Array<{ label: string; x: number; y: number }> = [];
  const labeledTw = new Set<string>();
  let controlTower: { x: number; y: number } | undefined;

  const features = record.geoJson?.features ?? [];
  const osmTaxiways = features.filter(
    (f) => f.properties.aeroway === "taxiway" && f.geometry.type === "LineString"
  );
  const osmGates = features.filter(
    (f) =>
      (f.properties.aeroway === "gate" || f.properties.aeroway === "parking_position") &&
      f.geometry.type === "Point"
  );

  // Add polygons (aprons, terminals, hangars, tower)
  for (const feat of features) {
    const aero = String(feat.properties.aeroway ?? "");
    if (aero === "tower") {
      if (feat.geometry.type === "Point") {
        const [lon, lat] = feat.geometry.coordinates as [number, number];
        controlTower = latLonToLocalNm(lat, lon, record.lat, record.lon);
      } else if (feat.geometry.type === "Polygon") {
        const ring = (feat.geometry.coordinates as Array<Array<[number, number]>>)[0];
        if (ring && ring.length > 0) {
          const pts = ring.map(([lon, lat]) => latLonToLocalNm(lat, lon, record.lat, record.lon));
          controlTower = {
            x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
            y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
          };
        }
      }
      continue;
    }

    if (feat.geometry.type === "Polygon") {
      const ring = (feat.geometry.coordinates as Array<Array<[number, number]>>)[0];
      if (!ring || ring.length < 3) continue;
      const pts = ring.map(([lon, lat]) => latLonToLocalNm(lat, lon, record.lat, record.lon));
      if (aero === "apron") {
        apronPolygons.push(pts);
      } else if (aero === "terminal" || aero === "hangar") {
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        terminalBuildings.push({
          kind: aero === "terminal" ? "TERMINAL" : "HANGAR",
          polygon: pts,
          label: feat.properties.name ? String(feat.properties.name) : undefined,
          labelX: cx,
          labelY: cy,
        });
      }
    }
  }

  // Helper to find or snap junction node within threshold NM
  let nodeSeq = 0;
  const findOrCreateSnappedNode = (
    x: number,
    y: number,
    snapDistNm: number,
    preferredKind: TaxiNode["kind"] = "TAXIWAY",
    label?: string
  ): TaxiNode => {
    let closest: TaxiNode | null = null;
    let bestD = snapDistNm;
    for (const n of Object.values(nodes)) {
      if (n.kind === "GATE" || n.kind === "PUSHBACK_SPOT") continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bestD) {
        bestD = d;
        closest = n;
      }
    }
    if (closest) return closest;
    nodeSeq += 1;
    const id = `OSM_T_${nodeSeq}`;
    const created: TaxiNode = { id, x, y, kind: preferredKind, label: label ?? id };
    addNode(created);
    return created;
  };

  // Construct connected taxiway graph when rich OSM taxiways exist (>4 ways)
  const usedRealOsmGraph = osmTaxiways.length >= 4;
  if (usedRealOsmGraph) {
    for (const twFeat of osmTaxiways) {
      const coords = twFeat.geometry.coordinates as Array<[number, number]>;
      if (coords.length < 2) continue;
      let twRef = String(twFeat.properties.ref ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!twRef || twRef.length > 5) {
        twRef = "LINK";
      }

      const rawPts = coords.map(([lon, lat]) => latLonToLocalNm(lat, lon, record.lat, record.lon));
      if (rawPts.length >= 2) {
        rawVisualSegments.push({ taxiway: twRef, points: rawPts });
      }

      // Preserve curved rapid-exit & bent taxiway geometry with high detail (~0.006 NM navigation resolution)
      const chainNodeIds: string[] = [];
      let prevPt: { x: number; y: number } | null = null;

      for (let i = 0; i < rawPts.length; i++) {
        const pt = rawPts[i];
        const isEnd = i === 0 || i === rawPts.length - 1;
        if (!isEnd && prevPt && Math.hypot(pt.x - prevPt.x, pt.y - prevPt.y) < 0.006) {
          continue;
        }
        prevPt = pt;
        const n = findOrCreateSnappedNode(pt.x, pt.y, 0.005, "TAXIWAY", twRef);
        if (chainNodeIds[chainNodeIds.length - 1] !== n.id) {
          chainNodeIds.push(n.id);
        }
      }

      for (let i = 0; i < chainNodeIds.length - 1; i++) {
        const a = nodes[chainNodeIds[i]];
        const b = nodes[chainNodeIds[i + 1]];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        let crossingRwy: RunwayId | undefined;

        for (const rwyId of runwayIds) {
          const rwy = runways[rwyId];
          const al = alongRunwayNm(rwy, mx, my);
          const cr = crossTrackRunwayNm(rwy, mx, my);
          if (al >= -0.04 && al <= rwy.lengthNm + 0.04 && Math.abs(cr) <= rwy.widthNm * 1.15) {
            crossingRwy = rwyId;
            break;
          }
        }
        addEdge(a.id, b.id, twRef, crossingRwy);
      }

      if (chainNodeIds.length >= 2) {
        taxiwayChains.push({ taxiway: twRef, nodeIds: chainNodeIds });
        if (!labeledTw.has(twRef) && twRef !== "LINK") {
          labeledTw.add(twRef);
          const midNode = nodes[chainNodeIds[Math.floor(chainNodeIds.length / 2)]];
          if (midNode) taxiwayLabels.push({ label: twRef, x: midNode.x, y: midNode.y });
        }
      }
    }

    // Wire hold-shorts & runway entry/exit points cleanly (spaced >= 0.20 NM along each runway side to avoid clutter)
    for (const rwyId of runwayIds) {
      const rwy = runways[rwyId];
      const placedNorthAlongs: number[] = [];
      const placedSouthAlongs: number[] = [];

      // Evaluate runway crossing nodes first
      for (const n of Object.values(nodes)) {
        if (n.kind !== "TAXIWAY") continue;
        const al = alongRunwayNm(rwy, n.x, n.y);
        const cr = crossTrackRunwayNm(rwy, n.x, n.y);
        if (al < -0.02 || al > rwy.lengthNm + 0.02) continue;

        if (Math.abs(cr) <= rwy.widthNm * 0.75) {
          n.kind = al < rwy.lengthNm * 0.35 ? "RUNWAY_ENTRY" : "RUNWAY_EXIT";
          n.runwayId = rwyId;
          rwy.crossingNodeIds.push(n.id);
          if (n.kind === "RUNWAY_ENTRY") rwy.entryNodeIds.push(n.id);
          else rwy.exitNodeIds.push(n.id);
        }
      }

      // Candidates sorted by closeness to ideal 0.055 NM hold-short setback
      const hsCandidates = Object.values(nodes)
        .filter((n) => {
          if (n.kind !== "TAXIWAY") return false;
          const al = alongRunwayNm(rwy, n.x, n.y);
          const cr = Math.abs(crossTrackRunwayNm(rwy, n.x, n.y));
          return al >= -0.02 && al <= rwy.lengthNm + 0.02 && cr > rwy.widthNm * 0.75 && cr <= 0.085;
        })
        .sort((a, b) => {
          const da = Math.abs(Math.abs(crossTrackRunwayNm(rwy, a.x, a.y)) - 0.055);
          const db = Math.abs(Math.abs(crossTrackRunwayNm(rwy, b.x, b.y)) - 0.055);
          return da - db;
        });

      for (const n of hsCandidates) {
        const al = alongRunwayNm(rwy, n.x, n.y);
        const cr = crossTrackRunwayNm(rwy, n.x, n.y);
        const placed = cr >= 0 ? placedNorthAlongs : placedSouthAlongs;
        if (placed.some((p) => Math.abs(p - al) < 0.2)) continue;
        placed.push(al);

        n.kind = "HOLD_SHORT";
        n.holdShortForRunway = rwyId;
        n.isNorthSide = cr >= 0;
        rwy.holdShortNodeIds.push(n.id);

        const rwyPt = runwayPoint(rwy, Math.max(0.03, Math.min(rwy.lengthNm - 0.03, al)), 0);
        let entryNode = Object.values(nodes).find(
          (rn) => rn.runwayId === rwyId && Math.hypot(rn.x - rwyPt.x, rn.y - rwyPt.y) < 0.08
        );
        if (!entryNode) {
          nodeSeq += 1;
          const eid = `RWY_${rwyId}_G_${nodeSeq}`;
          const isEntry = al < rwy.lengthNm * 0.35;
          entryNode = {
            id: eid,
            x: rwyPt.x,
            y: rwyPt.y,
            kind: isEntry ? "RUNWAY_ENTRY" : "RUNWAY_EXIT",
            label: `${rwyId}/${nodeSeq}`,
            runwayId: rwyId,
          };
          addNode(entryNode);
          if (isEntry) rwy.entryNodeIds.push(eid);
          else rwy.exitNodeIds.push(eid);
          rwy.crossingNodeIds.push(eid);
        }
        const twEdge = edges.find((e) => e.from === n.id && e.taxiway !== "APRON")?.taxiway ?? "A";
        addEdge(n.id, entryNode.id, twEdge, rwyId);
      }

      // Guarantee every real runway links cleanly into nearest OSM taxiway node even if OSM hold lines omit junction nodes
      if (rwy.entryNodeIds.length === 0 || rwy.holdShortNodeIds.length === 0) {
        const twNodes = Object.values(nodes).filter((tn) => tn.kind === "TAXIWAY");
        for (const frac of [0.08, 0.5, 0.92]) {
          const rPt = runwayPoint(rwy, rwy.lengthNm * frac, 0);
          let bestTw: TaxiNode | null = null;
          let bestD = Infinity;
          for (const tw of twNodes) {
            const d = Math.hypot(tw.x - rPt.x, tw.y - rPt.y);
            if (d < bestD) {
              bestD = d;
              bestTw = tw;
            }
          }
          if (!bestTw || bestD > 0.45) continue;
          nodeSeq += 1;
          const hsId = `OSM_HS_${rwyId}_${nodeSeq}`;
          const rNodeId = `OSM_RWY_${rwyId}_${nodeSeq}`;
          const cr = crossTrackRunwayNm(rwy, bestTw.x, bestTw.y);
          const hsPt = runwayPoint(rwy, rwy.lengthNm * frac, cr >= 0 ? 0.055 : -0.055);
          addNode({
            id: hsId,
            x: hsPt.x,
            y: hsPt.y,
            kind: "HOLD_SHORT",
            label: `HS ${rwyId}`,
            holdShortForRunway: rwyId,
            isNorthSide: cr >= 0,
          });
          addNode({
            id: rNodeId,
            x: rPt.x,
            y: rPt.y,
            kind: frac < 0.35 ? "RUNWAY_ENTRY" : "RUNWAY_EXIT",
            label: `${rwyId}/${nodeSeq}`,
            runwayId: rwyId,
          });
          const edgeTw = edges.find((e) => e.from === bestTw!.id)?.taxiway ?? "A";
          addEdge(bestTw.id, hsId, edgeTw);
          addEdge(hsId, rNodeId, edgeTw, rwyId);
          rwy.holdShortNodeIds.push(hsId);
          rwy.crossingNodeIds.push(rNodeId);
          if (frac < 0.35) rwy.entryNodeIds.push(rNodeId);
          else rwy.exitNodeIds.push(rNodeId);
        }
      }
    }

    // Stitch disconnected OSM taxiway islands (e.g., separate apron/terminal OSM ways)
    // so every terminal pier & concourse routes cleanly to active runways
    const allNodeIds = Object.keys(nodes);
    if (allNodeIds.length > 1) {
      const parent = new Map<string, string>(allNodeIds.map((id) => [id, id]));
      const findRoot = (id: string): string => {
        let cur = id;
        while (parent.get(cur) !== cur) {
          const p = parent.get(cur)!;
          parent.set(cur, parent.get(p)!);
          cur = p;
        }
        return cur;
      };
      const union = (a: string, b: string) => {
        const ra = findRoot(a);
        const rb = findRoot(b);
        if (ra !== rb) parent.set(rb, ra);
      };

      for (const e of edges) {
        if (parent.has(e.from) && parent.has(e.to)) {
          union(e.from, e.to);
        }
      }

      const byRoot = new Map<string, TaxiNode[]>();
      for (const id of allNodeIds) {
        const r = findRoot(id);
        const arr = byRoot.get(r) ?? [];
        arr.push(nodes[id]);
        byRoot.set(r, arr);
      }

      if (byRoot.size > 1) {
        // Anchor on largest component that has a runway entry/hold-short
        let mainRoot = "";
        let bestScore = -1;
        for (const [r, comp] of byRoot.entries()) {
          const hasRwyAccess = comp.some((n) => n.kind === "HOLD_SHORT" || n.kind === "RUNWAY_ENTRY");
          const score = comp.length + (hasRwyAccess ? 100000 : 0);
          if (score > bestScore) {
            bestScore = score;
            mainRoot = r;
          }
        }

        const mergedRoots = new Set<string>([mainRoot]);
        let safetyCounter = 0;
        while (mergedRoots.size < byRoot.size && safetyCounter < 120) {
          safetyCounter += 1;
          const mainNodes: TaxiNode[] = [];
          for (const mr of mergedRoots) {
            mainNodes.push(...(byRoot.get(mr) ?? []));
          }

          let bestOtherRoot: string | null = null;
          let bestU: TaxiNode | null = null;
          let bestV: TaxiNode | null = null;
          let bestDist = 0.45; // only bridge nearby real infrastructure gaps

          for (const [otherRoot, comp] of byRoot.entries()) {
            if (mergedRoots.has(otherRoot)) continue;
            for (const u of comp) {
              if (u.kind !== "TAXIWAY" && u.kind !== "HOLD_SHORT") continue;
              for (const v of mainNodes) {
                if (v.kind !== "TAXIWAY" && v.kind !== "HOLD_SHORT") continue;
                const d = Math.hypot(u.x - v.x, u.y - v.y);
                if (d < bestDist) {
                  bestDist = d;
                  bestOtherRoot = otherRoot;
                  bestU = u;
                  bestV = v;
                }
              }
            }
          }

          if (!bestOtherRoot || !bestU || !bestV) break;

          const mx = (bestU.x + bestV.x) / 2;
          const my = (bestU.y + bestV.y) / 2;
          let crossingRwy: RunwayId | undefined;
          for (const rwyId of runwayIds) {
            const rwy = runways[rwyId];
            const al = alongRunwayNm(rwy, mx, my);
            const cr = crossTrackRunwayNm(rwy, mx, my);
            if (al >= -0.04 && al <= rwy.lengthNm + 0.04 && Math.abs(cr) <= rwy.widthNm * 1.15) {
              crossingRwy = rwyId;
              break;
            }
          }

          const neighborTw =
            bestDist <= 0.03
              ? edges.find((e) => e.from === bestU!.id || e.from === bestV!.id)?.taxiway ?? "APRON"
              : "APRON";
          addEdge(bestU.id, bestV.id, neighborTw, crossingRwy);
          mergedRoots.add(bestOtherRoot);
        }
      }
    }
  }

  // Ensure every runway has connected hold-shorts + a clean fallback parallel/spine taxiway if OSM lacked entries
  const ensureRunwayFallbackInfrastructure = () => {
    const parallelOffset = 0.22;
    const cols: Array<{ col: TaxiwayName; alongFrac: number }> = [
      { col: "A", alongFrac: 0.04 },
      { col: "B", alongFrac: 0.25 },
      { col: "C", alongFrac: 0.55 },
      { col: "D", alongFrac: 0.85 },
      { col: "E", alongFrac: 0.96 },
    ];

    const spineIds: string[] = [];
    for (const c of cols) {
      const aAlong = primaryRwy.lengthNm * c.alongFrac;
      const pSpine = runwayPoint(primaryRwy, aAlong, parallelOffset);
      const pHs = runwayPoint(primaryRwy, aAlong, 0.065);
      const pRwy = runwayPoint(primaryRwy, aAlong, 0);

      const twNodeId = `FB_P_${c.col}`;
      const hsId = `FB_HS_${primaryDepRwyId}_${c.col}`;
      const rwyNodeId = `FB_RWY_${primaryDepRwyId}_${c.col}`;

      addNode({ id: twNodeId, x: pSpine.x, y: pSpine.y, kind: "TAXIWAY", label: `P/${c.col}` });
      addNode({
        id: hsId,
        x: pHs.x,
        y: pHs.y,
        kind: "HOLD_SHORT",
        label: `HS ${primaryDepRwyId} (${c.col})`,
        holdShortForRunway: primaryDepRwyId,
        isNorthSide: true,
      });
      const isEntry = c.alongFrac < 0.3;
      addNode({
        id: rwyNodeId,
        x: pRwy.x,
        y: pRwy.y,
        kind: isEntry ? "RUNWAY_ENTRY" : "RUNWAY_EXIT",
        label: `${primaryDepRwyId}/${c.col}`,
        runwayId: primaryDepRwyId,
      });

      addEdge(twNodeId, hsId, c.col);
      addEdge(hsId, rwyNodeId, c.col, primaryDepRwyId);
      taxiwayChains.push({ taxiway: c.col, nodeIds: [twNodeId, hsId, rwyNodeId] });
      spineIds.push(twNodeId);

      primaryRwy.holdShortNodeIds.push(hsId);
      primaryRwy.crossingNodeIds.push(rwyNodeId);
      if (isEntry) primaryRwy.entryNodeIds.push(rwyNodeId);
      else primaryRwy.exitNodeIds.push(rwyNodeId);
    }

    for (let i = 0; i < spineIds.length - 1; i++) {
      addEdge(spineIds[i], spineIds[i + 1], "P");
    }
    taxiwayChains.push({ taxiway: "P", nodeIds: spineIds });
    const midP = nodes[spineIds[2]];
    if (midP) taxiwayLabels.push({ label: "P", x: midP.x, y: midP.y });

    // Wire any secondary runways onto the fallback cross connectors too
    for (const rwyId of runwayIds.slice(1)) {
      const rwy = runways[rwyId];
      for (const c of [cols[0], cols[2], cols[4]]) {
        const pt = runwayPoint(rwy, rwy.lengthNm * c.alongFrac, 0);
        const ptHs = runwayPoint(rwy, rwy.lengthNm * c.alongFrac, 0.065);
        const hsId = `FB_HS_${rwyId}_${c.col}`;
        const rNodeId = `FB_RWY_${rwyId}_${c.col}`;
        addNode({
          id: hsId,
          x: ptHs.x,
          y: ptHs.y,
          kind: "HOLD_SHORT",
          label: `HS ${rwyId} (${c.col})`,
          holdShortForRunway: rwyId,
          isNorthSide: true,
        });
        addNode({
          id: rNodeId,
          x: pt.x,
          y: pt.y,
          kind: c.alongFrac < 0.3 ? "RUNWAY_ENTRY" : "RUNWAY_EXIT",
          label: `${rwyId}/${c.col}`,
          runwayId: rwyId,
        });
        addEdge(`FB_P_${c.col}`, hsId, c.col);
        addEdge(hsId, rNodeId, c.col, rwyId);
        rwy.holdShortNodeIds.push(hsId);
        rwy.crossingNodeIds.push(rNodeId);
        if (c.alongFrac < 0.3) rwy.entryNodeIds.push(rNodeId);
        else rwy.exitNodeIds.push(rNodeId);
      }
    }
  };

  if (!usedRealOsmGraph || primaryRwy.entryNodeIds.length === 0 || primaryRwy.holdShortNodeIds.length === 0) {
    ensureRunwayFallbackInfrastructure();
  }

  // Populate exit/entry defaults cleanly for every runway that still lacks them
  for (const rwyId of runwayIds) {
    const rwy = runways[rwyId];
    if (rwy.entryNodeIds.length === 0 && rwy.exitNodeIds.length > 0) {
      rwy.entryNodeIds.push(rwy.exitNodeIds[0]);
    }
    if (rwy.exitNodeIds.length === 0 && rwy.entryNodeIds.length > 0) {
      rwy.exitNodeIds.push(rwy.entryNodeIds[rwy.entryNodeIds.length - 1]);
    }
  }

  // 3. Wire Gates & Pushback Spots (real OSM gates if present, otherwise clean ramp gates)
  const gateIds: string[] = [];
  const usedGateNames = new Set<string>();
  const taxiwayNodes = Object.values(nodes).filter((n) => n.kind === "TAXIWAY");

  const attachGateToNearestTaxiway = (gateId: string, gx: number, gy: number, px: number, py: number) => {
    let bestTw: TaxiNode | null = null;
    let bestDist = Infinity;
    for (const tw of taxiwayNodes) {
      const d = Math.hypot(tw.x - px, tw.y - py);
      if (d < bestDist) {
        bestDist = d;
        bestTw = tw;
      }
    }
    if (!bestTw) return;
    addNode({
      id: `GATE_${gateId}`,
      x: gx,
      y: gy,
      kind: "GATE",
      label: gateId,
      gateId,
      pairedSpotId: `PB_${gateId}`,
      isNorthSide: true,
    });
    addNode({
      id: `PB_${gateId}`,
      x: px,
      y: py,
      kind: "PUSHBACK_SPOT",
      label: `Spot ${gateId}`,
      gateId,
      isNorthSide: true,
    });
    addEdge(`GATE_${gateId}`, `PB_${gateId}`, "APRON");
    addEdge(`PB_${gateId}`, bestTw.id, "APRON");
    gateIds.push(gateId);
  };

  if (osmGates.length > 0 && taxiwayNodes.length > 0) {
    for (let i = 0; i < Math.min(24, osmGates.length); i++) {
      const gf = osmGates[i];
      const [lon, lat] = gf.geometry.coordinates as [number, number];
      const pt = latLonToLocalNm(lat, lon, record.lat, record.lon);
      let ref = String(gf.properties.ref ?? `G${i + 1}`).toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!ref || usedGateNames.has(ref)) {
        ref = `G${i + 1}`;
      }
      if (usedGateNames.has(ref)) continue;
      usedGateNames.add(ref);

      // Pushback spot shifted ~0.068 NM toward nearest taxiway
      let nearestTw = taxiwayNodes[0];
      let minD = Infinity;
      for (const tw of taxiwayNodes) {
        const d = Math.hypot(tw.x - pt.x, tw.y - pt.y);
        if (d < minD) {
          minD = d;
          nearestTw = tw;
        }
      }
      const dx = nearestTw.x - pt.x;
      const dy = nearestTw.y - pt.y;
      const d = Math.hypot(dx, dy) || 1;
      const pushDist = Math.min(0.068, d * 0.6);
      attachGateToNearestTaxiway(
        ref,
        pt.x,
        pt.y,
        pt.x + (dx / d) * pushDist,
        pt.y + (dy / d) * pushDist
      );
    }
  }

  if (gateIds.length === 0) {
    const defaultGates = ["T1", "T2", "T3", "T4", "CARGO_1", "CARGO_2", "MIL_1", "MIL_2"];
    defaultGates.forEach((gid, i) => {
      const isSouth = gid.startsWith("CARGO") || gid.startsWith("MIL");
      const along = primaryRwy.lengthNm * (0.22 + (i % 4) * 0.14);
      const offset = isSouth ? -0.34 : 0.34;
      const pbOffset = isSouth ? -0.272 : 0.272;
      const gp = runwayPoint(primaryRwy, along, offset);
      const pb = runwayPoint(primaryRwy, along, pbOffset);
      attachGateToNearestTaxiway(gid, gp.x, gp.y, pb.x, pb.y);
      const gn = nodes[`GATE_${gid}`];
      if (gn) {
        gn.label = gid.startsWith("CARGO")
          ? `CARGO ${gid.slice(-1)}`
          : gid.startsWith("MIL")
          ? `MIL ${gid.slice(-1)}`
          : i < 2
          ? `${gid} (HEAVY)`
          : gid;
      }
    });
  } else {
    // Ensure every real-world airfield has designated Cargo and Military/Remote stands
    const hasCargoGate = gateIds.some(
      (g) => g.toUpperCase().includes("CARGO") || g.toUpperCase().startsWith("C")
    );
    const hasMilGate = gateIds.some(
      (g) =>
        g.toUpperCase().includes("MIL") ||
        g.toUpperCase().startsWith("M") ||
        g.toUpperCase().includes("REMOTE") ||
        g.toUpperCase().startsWith("R")
    );

    if (!hasCargoGate && taxiwayNodes.length > 0) {
      ["CARGO_1", "CARGO_2"].forEach((cid, i) => {
        const along = primaryRwy.lengthNm * (0.2 + i * 0.1);
        const gp = runwayPoint(primaryRwy, along, -0.34);
        const pb = runwayPoint(primaryRwy, along, -0.27);
        attachGateToNearestTaxiway(cid, gp.x, gp.y, pb.x, pb.y);
        const gn = nodes[`GATE_${cid}`];
        if (gn) gn.label = `CARGO ${i + 1}`;
      });
    }

    if (!hasMilGate && taxiwayNodes.length > 0) {
      ["MIL_1", "MIL_2"].forEach((mid, i) => {
        const along = primaryRwy.lengthNm * (0.7 + i * 0.1);
        const gp = runwayPoint(primaryRwy, along, -0.34);
        const pb = runwayPoint(primaryRwy, along, -0.27);
        attachGateToNearestTaxiway(mid, gp.x, gp.y, pb.x, pb.y);
        const gn = nodes[`GATE_${mid}`];
        if (gn) gn.label = `MIL ${i + 1}`;
      });
    }
  }

  // 4. Localizer IAFs, Navaids, Arrival & Departure Fixes
  const fixes: Record<string, NavFix> = {};
  const iafByRunway: Record<string, string> = {};
  for (const rwyId of runwayIds) {
    const rwy = runways[rwyId];
    const iafPt = runwayPoint(rwy, -6.5, 0);
    const fixId = `IF${rwyId}`;
    fixes[fixId] = {
      id: fixId,
      x: iafPt.x,
      y: iafPt.y,
      kind: "IAF",
      label: `${fixId} (ILS ${rwyId})`,
    };
    iafByRunway[rwyId] = fixId;
  }

  // Add real OurAirports navaids mapped cleanly around airport
  const navaidIds: string[] = [];
  for (const nav of (record.navaids ?? []).slice(0, 6)) {
    const pt = latLonToLocalNm(nav.lat, nav.lon, record.lat, record.lon);
    const dist = Math.hypot(pt.x, pt.y);
    if (dist < 1.5 || dist > 35) continue;
    const cleanId = nav.ident.toUpperCase().slice(0, 6);
    if (!cleanId || fixes[cleanId]) continue;
    const aheadDot = pt.x * primaryRwy.ux + pt.y * primaryRwy.uy;
    fixes[cleanId] = {
      id: cleanId,
      x: pt.x,
      y: pt.y,
      kind: aheadDot >= 0 ? "DEPARTURE" : "ARRIVAL",
      label: `${cleanId} (${nav.type})`,
    };
    navaidIds.push(cleanId);
  }

  const arr1 = runwayPoint(primaryRwy, -11.0, 3.8);
  const arr2 = runwayPoint(primaryRwy, -11.0, -3.8);
  const dep1 = runwayPoint(primaryRwy, 9.5, 3.8);
  const dep2 = runwayPoint(primaryRwy, 10.5, 0);
  const dep3 = runwayPoint(primaryRwy, 9.0, -4.0);
  const missed = runwayPoint(primaryRwy, 5.5, 1.8);

  if (!fixes["ARR1"]) fixes["ALPHA1"] = { id: "ALPHA1", x: arr1.x, y: arr1.y, kind: "ARRIVAL", label: "ALPHA1 (ARR)" };
  fixes["BRAVO1"] = { id: "BRAVO1", x: arr2.x, y: arr2.y, kind: "ARRIVAL", label: "BRAVO1 (ARR)" };
  fixes["DEP1"] = { id: "DEP1", x: dep1.x, y: dep1.y, kind: "DEPARTURE", label: "DEP1 (SID)" };
  fixes["DEP2"] = { id: "DEP2", x: dep2.x, y: dep2.y, kind: "DEPARTURE", label: "DEP2 (SID)" };
  fixes["DEP3"] = { id: "DEP3", x: dep3.x, y: dep3.y, kind: "DEPARTURE", label: "DEP3 (SID)" };
  fixes["MISSED"] = { id: "MISSED", x: missed.x, y: missed.y, kind: "MISSED", label: "MISSED (GA)" };

  const arrivalFixIds = Object.values(fixes)
    .filter((f) => f.kind === "ARRIVAL")
    .map((f) => f.id);
  const departureFixIds = Object.values(fixes)
    .filter((f) => f.kind === "DEPARTURE")
    .map((f) => f.id);

  // Clean fallback terminal box if no OSM terminal polygons exist
  if (terminalBuildings.length === 0) {
    const p1 = runwayPoint(primaryRwy, primaryRwy.lengthNm * 0.25, 0.36);
    const p2 = runwayPoint(primaryRwy, primaryRwy.lengthNm * 0.72, 0.43);
    const p3 = runwayPoint(primaryRwy, primaryRwy.lengthNm * 0.72, 0.36);
    const p4 = runwayPoint(primaryRwy, primaryRwy.lengthNm * 0.25, 0.43);
    terminalBuildings.push({
      kind: "TERMINAL",
      label: `${record.icao} TERMINAL`,
      labelX: (p1.x + p2.x) / 2,
      labelY: (p1.y + p2.y) / 2,
      polygon: [p1, p4, p2, p3],
    });
  }

  return {
    id: record.icao,
    icao: record.icao,
    iata: record.iata ?? undefined,
    name: record.name,
    city: record.city,
    country: record.country,
    lat: record.lat,
    lon: record.lon,
    timezone: record.timezone,
    category: record.category,
    dataQuality: record.dataQuality,
    isRealWorld: true,
    controllerPrefix: record.city || record.icao,
    difficulty: runwayIds.length >= 2 ? "CHALLENGING" : "STANDARD",
    description: `${record.name} (${record.icao}${record.iata ? `/${record.iata}` : ""}), ${record.city}, ${record.country} • ${runwayIds.length} runway(s).`,
    windText: `${String(Math.round(primaryRwy.heading)).padStart(3, "0")} at 9`,
    windLabel: `WIND ${String(Math.round(primaryRwy.heading)).padStart(3, "0")}/09KT`,
    elevationFt: record.elevationFt || 0,
    runwayIds,
    primaryDepartureRunway: primaryDepRwyId,
    primaryArrivalRunway: primaryArrRwyId,
    runways,
    nodes,
    edges,
    fixes,
    gateIds,
    arrivalFixIds,
    departureFixIds,
    iafByRunway,
    terminalZones: [],
    apronPolygons: apronPolygons.length > 0 ? apronPolygons : undefined,
    terminalBuildings,
    taxiwayChains: taxiwayChains.length > 0 ? taxiwayChains : undefined,
    visualTaxiways:
      rawVisualSegments.length > 0 ? mergeContinuousVisualTaxiways(rawVisualSegments) : undefined,
    controlTower,
    taxiwayLabels,
    frequencies: record.frequencies,
    navaids: record.navaids,
    rawRunways: record.runways,
    geoJson: record.geoJson ?? undefined,
  };
}
