# AirCommand — Clearance-Gated Air Traffic Control Simulator

**AirCommand** is a browser-based Air Traffic Control simulator built with React, TypeScript, Zustand, Tailwind CSS, and HTML5 Canvas. Every movement in the airspace and on the airfield obeys a **strict clearance-gated invariant**: no aircraft ever pushes back, taxis, crosses a runway, lines up, takes off, lands, climbs, turns, or changes speed without a structured, validated, pilot-readback-acknowledged `ATCClearance`.

## Core Architecture

```text
               CONTROLLER LAYER
                      │
        ┌─────────────┴─────────────┐
        │                           │
   PLAYER CONTROLLER      AUTONOMOUS CONTROLLERS (GROUND / TOWER / DEPARTURE)
        │                           │
        └─────────────┬─────────────┘
                      │
               DECISION ENGINE        (src/engine/decisionEngine.ts)
                      │
               CLEARANCE ENGINE       (src/engine/clearanceEngine.ts)
                      │
              VALIDATION ENGINE       (src/engine/validationEngine.ts)
                      │
               AIRCRAFT ENGINE        (src/engine/aircraftEngine.ts)
                      │
               MOVEMENT ENGINE        (src/engine/movementEngine.ts)
```

Both manual player instructions and autonomous AI controllers route every command through `submitClearanceDecision`, generating structured `ATCClearance` records with full lifecycle state (`ISSUED` → `READBACK_PENDING` → `ACTIVE` → `EXECUTED` → `COMPLETED`, plus `READBACK_ERROR`, `CANCELLED`, and `SUPERSEDED`). Every movement step queries `canAircraftMove` and `canAircraftExecuteAction`.

## Features

- **Strict ATC Rules & Emergency Handling**: Enforces pushback separation, assigned taxiway route adherence, mandatory hold-short stops, explicit runway crossings, line up & wait, pre-roll cancel takeoff vs. rolling rejected takeoff (`STOPPED_ON_RUNWAY` + ARFF tow), readback errors, Squawk `7600` NORDO (Tower Light Gun), and `GO_AROUND` procedures.
- **Multi-Airport Operations with Persistent Selection**:
  - `KAST` — Asteria International (staggered diagonal parallel runways `09L/27R` & `09R/27L`, angled rapid-exit taxiways, curved bypass loops, Y-terminal concourses)
  - `KMRD` — Meridian Bay Coastal (`27R / 27L`)
  - `KVEL` — Veloce Alpine (`09`)
  - `KSOL` — Solaris Mega-Hub (`08L / 08R`)
  - Saved automatically to browser `localStorage` along with theme preference.
- **Role Switching & Strict Frequency Audio Isolation**:
  - Switch seamlessly between **Ground (`G`)**, **Tower (`T`)**, **Departure/Approach (`D`)**, or **All Auto (`N`)** (default mode automating all three stations).
  - Switching into a single role automates the remaining controllers and filters VHF radio audio strictly to that station's frequency.
- **Authentic VHF Radio Speech & NATO/ICAO Phonetics**:
  - Synthesizes ATC clearances and pilot voice readbacks using the Web Speech API + Web Audio API VHF bandpass squelch and radio static.
  - Full `A–Z` ICAO phonetic alphabet (`Alfa` through `Zulu`) formatting for callsigns, taxiways, runways, gates, and waypoints, with voice selection and ICAO reference lookup in the `VOICE` menu.
- **Light Chart & Dark Radar Themes + Accordion UI**:
  - Switchable Light aviation-chart theme (default) and Dark tactical radar theme (`SUN / MOON` toggle).
  - Organized minimal workstation panels with collapsible Accordions (`Flight Strips`, `Station Workload`, `Available Clearances`, `Flight Telemetry`, `Structured Clearances`, `Incident Triggers`).
- **Tabbed Bottom Panel (`Radio & Event Log` + `Aircraft Details`)**:
  - View live filtered VHF communications and alerts, or inspect the selected aircraft's **From → To** flight plan, airline livery side-profile illustration, tail registration, fuel, payload/crew, and performance specifications.

## Controls & Shortcuts

- **Role Switching**: Click `G`, `T`, `D`, or `N` (`ALL AUTO`) in the top bar, or press keys `1`/`G`, `2`/`T`, `3`/`D`, `4`/`0`/`N`/`A`.
- **Pause / Resume**: `Space` or the **LIVE / PAUSED** button.
- **Select Aircraft**: Click any aircraft marker on the chart canvas, strip in the left rack, or log entry.
- **Chart Navigation**: Drag to pan, scroll wheel to zoom at cursor, or use `GND` / `TWR` / `RADAR` preset views.
- **In-App Rule Verifier**: Click the green Shield icon in the top bar (or inside Workstation Settings) to run the mandatory verification suite live in the browser.

## Getting Started

```bash
npm install      # Install dependencies
npm run dev      # Start Vite development server (http://localhost:3000)
npm test         # Run Node test suites (tests/*.test.ts)
npm run build    # Type-check with tsc and build production bundle into dist/
```

## Project Structure

```text
src/
├── App.tsx
├── index.css
├── main.tsx
├── components/
│   ├── Accordion.tsx
│   ├── AircraftSideProfile.tsx
│   ├── AirportLandingScreen.tsx
│   ├── ClearanceControlDeck.tsx
│   ├── FlightStripRack.tsx
│   ├── RadarScopeCanvas.tsx
│   ├── RadioCommsLog.tsx
│   ├── RadioVoiceMenu.tsx
│   ├── TopBar.tsx
│   └── VerificationModal.tsx
├── data/
│   ├── aircraftCatalog.ts
│   └── asteriaAirport.ts
├── engine/
│   ├── aircraftEngine.ts
│   ├── autonomousControllers.ts
│   ├── clearanceEngine.ts
│   ├── decisionEngine.ts
│   ├── movementEngine.ts
│   ├── simulation.ts
│   ├── validationEngine.ts
│   └── verificationSuite.ts
├── store/
│   └── atcStore.ts
├── types/
│   └── atc.ts
└── utils/
    ├── natoPhonetics.ts
    ├── radioAudio.ts
    └── storage.ts
tests/
├── aircraftDetails.test.ts
├── airports.test.ts
├── atcMandatory.test.ts
├── radioSpeech.test.ts
└── roleSwitching.test.ts
```
