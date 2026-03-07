---
name: openfoam-pimplefoam
description: "OpenFOAM pimpleFoam offset-cylinder. READ THIS SKILL: create case with write tool only (full Template 1–11 content per file); never echo. All 11 files must exist; then run from case dir: cd CASE_DIR && ./Allrun. Do NOT run 'openfoam-pimplefoam' or blockMesh from wrong cwd (causes 'controlDict' error)."
metadata:
  {
    "openclaw":
      {
        "emoji": "🌊",
        "requires": { "bins": [] },
        "note": "OpenFOAM (blockMesh, snappyHexMesh, pimpleFoam) must be installed and WM_PROJECT_DIR sourced.",
      },
  }
---

# OpenFOAM pimpleFoam (Laminar Incompressible) Skill

Run laminar incompressible flow simulations with **pimpleFoam** (e.g. offset cylinder in a channel).

---

## Agent: read this first (mandatory)

**You must follow this skill when the user asks to run the offset-cylinder pimpleFoam case.**

- **DO** create the case with the **write** tool: one **write** call per file, using the **full** content from **Template 1–11** in section "Create case from scratch (if Allrun not found)". All 11 files must exist (Allrun, Allclean, system/controlDict, blockMeshDict, snappyHexMeshDict, fvSchemes, fvSolution, constant/transportProperties, constant/turbulenceProperties, 0/U, 0/p).
- **DO NOT** use `echo '...'` or shell commands to create Allrun or config files — that breaks or truncates content and causes "Could not find mandatory etc entry 'controlDict'".
- **DO NOT** run blockMesh or pimpleFoam until all 11 files are written. Then run **from the case directory**: `cd /path/to/case && ./Allrun` (or `cd /path/to/case && blockMesh` then snappyHexMesh then pimpleFoam). If you run blockMesh with a different working directory, OpenFOAM will not find system/controlDict and will report the same fatal error.
- **DO NOT** run any command named "openfoam-pimplefoam" — there is no such executable.

**When you see an error (e.g. "controlDict" not found):** First **diagnose**, then fix. Do **not** default to "I will recreate all 11 files". Instead: list the case directory and subdirs; see which of the 11 files exist and their sizes; read controlDict (and Allrun if present) to see if content is wrong or truncated. Then fix only what is missing or incorrect, or fix the run directory (cd to case then run). Recreate all 11 only if the case directory is empty or clearly broken beyond spot fixes.

If you see "Could not find mandatory etc entry 'controlDict'": **do not immediately recreate all files.** First **diagnose**: (1) List the case directory (`ls -la` and `find` for 0/, constant/, system/) and check which of the 11 files exist. (2) If controlDict exists, read it and check it has required keywords (startFrom, stopAt, deltaT, writeControl, writeInterval). (3) Check whether blockMesh/Allrun was run with the shell’s working directory equal to the case directory — if not, run `cd <case_dir> && ./Allrun` instead of running from elsewhere. Only **after** diagnosis: fix or add only the missing or wrong files (or fix the run directory). Do not blindly recreate all 11 files every time.

---

## Important: how to run (agent must follow)

**`openfoam-pimplefoam` is the skill name only. There is no executable or command called `openfoam-pimplefoam`.** Do not try to run that name as a command.

**Do NOT run `blockMesh`, `snappyHexMesh`, or `pimpleFoam` in the specified directory until the case files exist.** If there is no `Allrun` and no `system/controlDict`, the directory is not a valid case — **you must create the full case first** (write Allrun, Allclean, 0/, constant/, system/ from the template). Running blockMesh in an empty or incomplete directory will fail with "cannot find controlDict". **Order: (1) ensure OpenFOAM in PATH, (2) if no Allrun → create case (write all 11 files), (3) only then run ./Allrun or blockMesh/snappyHexMesh/pimpleFoam.**

You must use the **shell** and **file write** tools:

**When creating the case:** Use the **write** tool to create each file with the **full** content from the templates (Template 1–11). Do **not** use `echo '...'` or a single shell command to write Allrun or config files — that will truncate or corrupt multi-line content and cause "missing controlDict" or run failures. Create each of the 11 files with a separate **write** call, pasting the exact template block for that file.

1. **Find OpenFOAM**: run `which blockMesh` and `which pimpleFoam`. If both return paths (e.g. `/usr/bin/blockMesh`), OpenFOAM is in PATH — no need to source. If not found, source OpenFOAM (see "How to find OpenFOAM"); **never** use a placeholder like `OpenFOAM-vX.X` — use a real path or discover it with `find`.
2. **Case directory**: user specifies a directory (e.g. `/home/notrickno/桌面/openfoam`) — that is the case root. **If `Allrun` is not there** (and no `system/controlDict`): **create the full case before running any solver.** Use the section "Create case from scratch (if Allrun not found)": write Allrun, Allclean, and files under 0/, constant/, system/ (all 11 files with exact content). Then `chmod +x Allrun Allclean`. Do **not** run blockMesh until these files exist.
3. **Run the simulation**: only after the case exists — in the case directory run `./Allrun`, or in order: `blockMesh`, `snappyHexMesh -overwrite`, `pimpleFoam`. All in the **same shell** and in the **case directory**.

## How to find OpenFOAM on the machine

- Run `which blockMesh` and `which pimpleFoam`. If they show paths (e.g. `/usr/bin/blockMesh`), PATH is set — **do not** source; run the case directly.
- If not in PATH, source OpenFOAM before running. **Do not guess paths like `/path/to/OpenFOAM-vX.X`.** Use one of the real paths below, or discover bashrc:
  - `find /usr /opt "$HOME" -name bashrc -path '*[Oo]penfoam*' 2>/dev/null`
  - Or: `find /usr /opt "$HOME" -name bashrc 2>/dev/null` and pick the one under an OpenFOAM install.
- **Common real paths** (use one that exists on the user’s system):
  - System: `/usr/lib/openfoam/openfoam2012/etc/bashrc`, `/opt/openfoam10/etc/bashrc`, `/opt/openfoam9/etc/bashrc`
  - User build: `$HOME/桌面/OpenFOAM-v2012/etc/bashrc` (Linux 桌面), `$HOME/OpenFOAM/OpenFOAM-v2012/etc/bashrc`
- **If `which blockMesh` already returns a path** (e.g. `/usr/bin/blockMesh`): the system may have OpenFOAM from a package; **no need to source**. The Allrun template checks for this and runs blockMesh/snappyHexMesh/pimpleFoam directly when they are in PATH. Do not insist on sourcing `/usr/share/openfoam/etc/bashrc` if that install is incomplete (e.g. only etc/, no bin/foamEtcFile) — use the binaries from PATH instead.

After sourcing, run `which blockMesh` again to confirm.

## How to enable this skill (user config)

OpenClaw loads skills from (in order): **bundled** → **managed** `~/.openclaw/skills` → **workspace** `<workspace>/skills`, plus optional `skills.load.extraDirs` in `~/.openclaw/openclaw.json`.

**Option A — Workspace is the openclaw repo**  
If you run the agent with workspace = this repo root, `skills/openfoam-pimplefoam` is already under `<workspace>/skills`. No config needed. Check with: `openclaw skills list` (skill should appear).

**Option B — Make skill available for any workspace**  
Copy or symlink this skill into managed skills so all agents see it:

```bash
mkdir -p ~/.openclaw/skills
cp -r /path/to/openclaw/skills/openfoam-pimplefoam ~/.openclaw/skills/
# or: ln -s /path/to/openclaw/skills/openfoam-pimplefoam ~/.openclaw/skills/
```

**Option C — Add repo skills as extra dir**  
In `~/.openclaw/openclaw.json`, under `skills.load.extraDirs`, add the repo’s `skills` folder (use the real path, e.g. `"$HOME/桌面/github/openclaw/skills"` or absolute path). Restart or wait for the skill watcher to pick it up.

Optional: in `skills.entries` set `"openfoam-pimplefoam": { "enabled": true }` (default is enabled if the skill is loaded). Run `openclaw skills list` or `openclaw skills list --eligible` to confirm the skill is loaded.

## When to Use

- User asks to run "offset cylinder" or "pimpleFoam" laminar case.
- User specifies: kinematic viscosity (nu), inlet velocity, initial velocity, time range, time step, output interval.
- User wants to "perform a laminar incompressible flow simulation around an offset cylinder using pimpleFoam".

## Templates (模板)

When creating the case, use the **exact** content from section **"Create case from scratch (if Allrun not found)"** below. This section is a quick index and minimal reference.

**Case file list (11 files):**

| #   | Path                            | Description                                                                   |
| --- | ------------------------------- | ----------------------------------------------------------------------------- |
| 1   | `Allrun`                        | Script: blockMesh → snappyHexMesh -overwrite → pimpleFoam; must be executable |
| 2   | `Allclean`                      | Script: remove processor*, 0.*, constant/polyMesh; must be executable         |
| 3   | `system/controlDict`            | Time control: startTime 0, endTime 2, deltaT 0.005, writeInterval 0.1         |
| 4   | `system/blockMeshDict`          | Background channel mesh                                                       |
| 5   | `system/snappyHexMeshDict`      | Offset cylinder geometry and refinement                                       |
| 6   | `system/fvSchemes`              | Numerical schemes                                                             |
| 7   | `system/fvSolution`             | Solver and PIMPLE settings                                                    |
| 8   | `constant/transportProperties`  | nu 0.006                                                                      |
| 9   | `constant/turbulenceProperties` | simulationType laminar                                                        |
| 10  | `0/U`                           | Velocity: internalField (0 0 0), inlet fixedValue (4 0 0)                     |
| 11  | `0/p`                           | Pressure: internalField 0, outlet fixedValue 0                                |

**Minimal template — system/controlDict (required keywords):**

```
application     pimpleFoam;
startFrom       startTime;
startTime       0;
stopAt          endTime;
endTime         2;
deltaT          0.005;
writeControl    runTime;
writeInterval   0.1;
purgeWrite      0;
writeFormat     ascii;
writePrecision  6;
runTimeModifiable true;
functions       { }
```

(Plus FoamFile header; see full template below.)

**Minimal template — 0/U (structure):** Use `internalField uniform (0 0 0);` and `boundaryField { inlet { type fixedValue; value uniform (4 0 0); } outlet { type zeroGradient; } ... }`. Do **not** use custom keys like `inletVelocity`.

**Minimal template — constant/transportProperties:** Use `FoamFile { }` header, then `transportModel Newtonian;` and `nu 0.006;` (no `[0]` before 0.006).

Full content for every file is in **"Create case from scratch (if Allrun not found)"** — copy each block exactly when writing the case.

## Paths (reference)

Write these in the skill so the agent knows where to look or what to suggest.

**OpenFOAM environment (source before run if binaries not in PATH):**

- System install: `source /usr/lib/openfoam/openfoam2012/etc/bashrc` or `source /opt/openfoam10/etc/bashrc` (distro-dependent).
- User build (e.g. 桌面): `source $HOME/桌面/OpenFOAM-v2012/etc/bashrc`.
- If `which blockMesh` and `which pimpleFoam` already show `/usr/bin/...`, PATH is set and sourcing may be optional.

**Offset-cylinder case directory** (use the path the user specified, or one of these):

- User may say "在指定目录下" and give a path, e.g. `/home/notrickno/桌面/openfoam` — then the case is `<that_path>/offset_cylinder_case` (e.g. `/home/notrickno/桌面/openfoam/offset_cylinder_case`). If that folder does not exist, create the full case there (0/, constant/, system/, Allrun, Allclean, etc.) then run.
- Default examples: `$HOME/桌面/openfoam/offset_cylinder_case`, `$HOME/桌面/openfoam_simulations/offset_cylinder_case`, or `$HOME/Desktop/openfoam_simulations/offset_cylinder_case`.

## Dependencies (Must Be Installed First)

1. **OpenFOAM** (e.g. OpenFOAM-v2012, or OpenFOAM 8/9/10 from system package).
2. **Environment**: Source one of the paths above if `blockMesh`/`pimpleFoam` are not in PATH.
3. **Required binaries**: `blockMesh`, `snappyHexMesh`, `pimpleFoam`.

If OpenFOAM is not installed, instruct the user to install it (e.g. from [openfoam.com](https://www.openfoam.com/) or distro packages) and to source its `etc/bashrc` before running the case.

## Case: Offset Cylinder (Pre-configured)

A ready-made case is provided with:

- **Solver**: pimpleFoam (laminar).
- **Kinematic viscosity** ν = 0.006 m²/s.
- **Inlet velocity** = 4 m/s; **initial field** = 0 m/s.
- **Time**: 0 → 2 s; **time step** Δt = 0.005 s; **output every** 0.1 s.

**Typical case path** (adjust to the user’s machine):

- Linux (桌面): `~/桌面/openfoam_simulations/offset_cylinder_case`
- Or: `$HOME/Desktop/openfoam_simulations/offset_cylinder_case` if the case is on Desktop.

### One-command run (recommended)

From the **case directory** and with OpenFOAM already sourced:

```bash
cd ~/桌面/openfoam_simulations/offset_cylinder_case   # or user’s actual path
./Allrun
```

`Allrun` does: `blockMesh` → `snappyHexMesh -overwrite` → `pimpleFoam`.

### Step-by-step (manual)

From the case directory, with OpenFOAM environment loaded:

```bash
blockMesh
snappyHexMesh -overwrite
pimpleFoam
```

### Clean and re-run

```bash
./Allclean
./Allrun
```

## Create case from scratch (if Allrun not found)

**Do this before running blockMesh.** If you run blockMesh in an empty directory, it will fail with "cannot find controlDict". Creating the case means writing all files below first.

If the user specifies a directory (e.g. `/home/notrickno/桌面/openfoam`) and **Allrun does not exist** there (and no `system/controlDict`), **create the full case** in that directory. Create directories `0/`, `constant/`, `system/`, then write the following 11 files with the exact content below. **Use the write tool once per file** — do not use `echo` or heredoc in the shell to create Allrun or the config files, or the content will be truncated/broken. Then run `chmod +x Allrun Allclean` in that directory and `./Allrun`.

**Template 1 — Allrun** (case root; must be executable)

```bash
#!/bin/bash
# Laminar incompressible flow around offset cylinder (pimpleFoam)
# nu=0.006 m2/s, U_inlet=4 m/s, t=0..2, dt=0.005, write every 0.1 s

cd "${0%/*}" || exit

# If blockMesh/pimpleFoam already in PATH (e.g. /usr/bin from system package), use them without sourcing
if command -v blockMesh >/dev/null 2>&1 && command -v pimpleFoam >/dev/null 2>&1; then
    :
elif [ -f /usr/lib/openfoam/openfoam2012/etc/bashrc ]; then
    . /usr/lib/openfoam/openfoam2012/etc/bashrc
elif [ -n "$WM_PROJECT_DIR" ] && [ -f "$WM_PROJECT_DIR/etc/bashrc" ]; then
    . "$WM_PROJECT_DIR/etc/bashrc"
elif [ -f "$HOME/桌面/OpenFOAM-v2012/etc/bashrc" ]; then
    . "$HOME/桌面/OpenFOAM-v2012/etc/bashrc"
else
    echo "Error: OpenFOAM environment not found. Source your OpenFOAM bashrc first."
    exit 1
fi

# Run solvers (use runApplication if available after source, else call binaries directly)
if type runApplication >/dev/null 2>&1; then
    runApplication blockMesh
    runApplication snappyHexMesh -overwrite
    runApplication pimpleFoam
else
    blockMesh
    snappyHexMesh -overwrite
    pimpleFoam
fi

echo "Done. Results in 0.1, 0.2, ... 2.0"
```

**Template 2 — Allclean** (case root; must be executable)

```bash
#!/bin/bash
cd "${0%/*}" || exit

rm -rf processor* 0.* [1-9]* [1-9]*.* constant/polyMesh
rm -rf log.* *.log
echo "Cleaned. Run Allrun to regenerate mesh and run."
```

**Template 3 — system/controlDict**

```
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    location    "system";
    object      controlDict;
}

application     pimpleFoam;
startFrom       startTime;
startTime       0;
stopAt          endTime;
endTime         2;
deltaT          0.005;
writeControl    runTime;
writeInterval  0.1;
purgeWrite      0;
writeFormat     ascii;
writePrecision  6;
writeCompression off;
timeFormat      general;
timePrecision   6;
runTimeModifiable true;

functions
{
}
```

**Template 4 — system/blockMeshDict**

```
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      blockMeshDict;
}

convertToMeters 1;

vertices
(
    (-5 -2 -0.05)
    (15 -2 -0.05)
    (15  2 -0.05)
    (-5  2 -0.05)
    (-5 -2  0.05)
    (15 -2  0.05)
    (15  2  0.05)
    (-5  2  0.05)
);

blocks
(
    hex (0 1 2 3 4 5 6 7) (100 20 1) simpleGrading (1 1 1)
);

edges
(
);

boundary
(
    inlet
    {
        type patch;
        faces
        (
            (0 4 7 3)
        );
    }
    outlet
    {
        type patch;
        faces
        (
            (1 2 6 5)
        );
    }
    lowerWall
    {
        type wall;
        faces
        (
            (0 1 5 4)
        );
    }
    upperWall
    {
        type wall;
        faces
        (
            (3 7 6 2)
        );
    }
    frontAndBack
    {
        type empty;
        faces
        (
            (0 3 2 1)
            (4 5 6 7)
        );
    }
);

mergePatchPairs
(
);
```

**Template 5 — system/snappyHexMeshDict**

```
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      snappyHexMeshDict;
}

castellatedMesh true;
snap            true;
addLayers       false;

geometry
{
    cylinder
    {
        type    cylinder;
        point1  (0 0.5 -0.05);
        point2  (0 0.5  0.05);
        radius  0.25;
    }
}

castellatedMeshControls
{
    maxLocalCells       50000;
    maxGlobalCells      500000;
    minRefinementCells  10;
    maxLoadUnbalance    0.10;
    nCellsBetweenLevels 1;
    resolveFeatureAngle 30;
    allowFreeStandingZoneFaces true;
    features
    ();
    refinementSurfaces
    {
        cylinder
        {
            level (2 2);
            patchInfo
            {
                type wall;
            }
        }
    };
    refinementRegions
    {};
    locationInMesh (5 0 0);
}

snapControls
{
    nSmoothPatch    3;
    tolerance       2.0;
    nSolveIter      100;
    nRelaxIter      5;
}

addLayersControls
{}

meshQualityControls
{
    maxNonOrtho         65;
    maxBoundarySkewness 20;
    maxInternalSkewness 4;
    maxConcave          80;
    minVol              1e-13;
    minArea             -1;
    minTwist            0.02;
    minDeterminant      0.001;
    minFaceWeight       0.02;
    minVolRatio         0.01;
    minTriangleTwist    0.05;
    nSmoothScale        4;
    errorReduction      0.75;
}

debug 0;
mergeTolerance 1e-6;
```

**Template 6 — system/fvSchemes**

```
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    location    "system";
    object      fvSchemes;
}

ddtSchemes
{
    default         Euler;
}

gradSchemes
{
    default         Gauss linear;
}

divSchemes
{
    default         none;
    div(phi,U)      Gauss linearUpwind grad(U);
    div((nuEff*dev(T(grad(U))))) Gauss linear;
}

laplacianSchemes
{
    default         Gauss linear corrected;
}

interpolationSchemes
{
    default         linear;
}

snGradSchemes
{
    default         corrected;
}

fluxRequired
{
    default         no;
    p               ;
}
```

**Template 7 — system/fvSolution**

```
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    location    "system";
    object      fvSolution;
}

solvers
{
    p
    {
        solver           GAMG;
        smoother         DICGaussSeidel;
        tolerance        1e-6;
        relTol           0.01;
    }

    pFinal
    {
        $p;
        relTol          0;
    }

    U
    {
        solver          smoothSolver;
        smoother        symGaussSeidel;
        tolerance       1e-05;
        relTol          0.1;
    }

    UFinal
    {
        $U;
        relTol          0;
    }
}

PIMPLE
{
    nNonOrthogonalCorrectors 0;
    nCorrectors         2;
}
```

**Template 8 — constant/transportProperties**

```
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    location    "constant";
    object      transportProperties;
}

transportModel  Newtonian;

nu              0.006;
```

**Template 9 — constant/turbulenceProperties**

```
FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    location    "constant";
    object      turbulenceProperties;
}

simulationType laminar;
```

**Template 10 — 0/U**

```
FoamFile
{
    version     2.0;
    format      ascii;
    class       volVectorField;
    object      U;
}

dimensions      [0 1 -1 0 0 0 0];

internalField   uniform (0 0 0);

boundaryField
{
    inlet
    {
        type            fixedValue;
        value           uniform (4 0 0);
    }
    outlet
    {
        type            zeroGradient;
    }
    lowerWall
    {
        type            noSlip;
    }
    upperWall
    {
        type            noSlip;
    }
    cylinder
    {
        type            noSlip;
    }
    frontAndBack
    {
        type            empty;
    }
}
```

**Template 11 — 0/p**

```
FoamFile
{
    version     2.0;
    format      ascii;
    class       volScalarField;
    object      p;
}

dimensions      [0 2 -2 0 0 0 0];

internalField   uniform 0;

boundaryField
{
    inlet
    {
        type            zeroGradient;
    }
    outlet
    {
        type            fixedValue;
        value           uniform 0;
    }
    lowerWall
    {
        type            zeroGradient;
    }
    upperWall
    {
        type            zeroGradient;
    }
    cylinder
    {
        type            zeroGradient;
    }
    frontAndBack
    {
        type            empty;
    }
}
```

After writing all files: run `chmod +x Allrun Allclean` in the case directory, then `./Allrun`.

**Common agent mistakes to avoid:**

- **controlDict**: Must use exact OpenFOAM keywords: `startFrom startTime;`, `stopAt endTime;`, `deltaT 0.005;` (not `deltaTStart`), `writeControl runTime;`, `writeInterval 0.1;`, plus `purgeWrite`, `writeFormat`, `runTimeModifiable`, `functions { }`. Omitting these can cause "Could not find mandatory etc entry 'controlDict'" or run-time errors.
- **0/U**: Must be standard OpenFOAM volVectorField format: `dimensions`, `internalField uniform (0 0 0);`, `boundaryField { inlet { type fixedValue; value uniform (4 0 0); } ... }`. Do **not** use custom keys like `inletVelocity` or `initialVelocity` — the solver expects `internalField` and `boundaryField`.
- **constant/transportProperties**: Must include a `FoamFile { }` header and `nu 0.006;` (no `[0]` or other dimension in front of the value unless you use full dimensioned scalar syntax).
- **All 11 files** must exist before running blockMesh: Allrun, Allclean, system/controlDict, system/blockMeshDict, system/snappyHexMeshDict, system/fvSchemes, system/fvSolution, constant/transportProperties, constant/turbulenceProperties, 0/U, 0/p. Running from a directory that is not the case root (so system/controlDict is not found) also causes the "etc entry controlDict" error — always `cd` to the case directory first.
- **Creating files**: use the **write** tool with the full template content for each file. Do **not** use `echo '...'` or a single shell command to create Allrun or multi-line config files — that truncates or breaks content and leads to "missing controlDict" or invalid scripts.

## Changing Parameters

- **ν (nu)**: edit `constant/transportProperties` → `nu 0.006;`
- **Inlet velocity**: edit `0/U` → boundary `inlet` → `value uniform (4 0 0);`
- **Initial velocity**: edit `0/U` → `internalField uniform (0 0 0);`
- **Time range / time step / write interval**: edit `system/controlDict` → `startTime`, `endTime`, `deltaT`, `writeControl`, `writeInterval`

## Output and run time

- Result times: `0.1`, `0.2`, … `2.0` (every 0.1 s).
- Fields: `U`, `p` (and mesh in `constant/polyMesh` after snappyHexMesh).
- **Typical run time**: a few minutes to tens of minutes (blockMesh and snappyHexMesh are quick; pimpleFoam from t=0 to 2 s with dt=0.005 depends on mesh size and CPU). If the user asks how long it will take, say a few to several minutes and that it runs in the background until done.

## Quick Reference (Task Checklist)

1. **Check OpenFOAM**: run `which blockMesh` and `which pimpleFoam`. If not found, source a **real** OpenFOAM bashrc path (see "How to find OpenFOAM"); never use placeholder paths like `OpenFOAM-vX.X`.
2. **Case directory**: use the path the user specified (e.g. `/home/notrickno/桌面/openfoam`) as the case root. **If Allrun or system/controlDict is not there: do NOT run blockMesh yet.** Create the full case: write Allrun, Allclean, and all 11 files from "Create case from scratch (if Allrun not found)" into that directory (create 0/, constant/, system/ as needed), then `chmod +x Allrun Allclean`. Only after the case exists, go to step 3.
3. **Run**: in the case directory run `./Allrun`, or in order: `blockMesh`, `snappyHexMesh -overwrite`, `pimpleFoam`. Do **not** run any command named "openfoam-pimplefoam".
4. **If run failed** (e.g. "controlDict" not found): **diagnose first** — list case dir and 0/, constant/, system/; check which of the 11 files exist and read their content; fix only what is missing or wrong (or fix cwd: run from case dir). Do **not** default to "recreate all 11 files".
5. Optionally run `./Allclean` before a full re-run.
