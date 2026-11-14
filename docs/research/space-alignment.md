# Space Alignment Research

What is known about why the Lighthouse tracking space and the tracking space of a
non-Lighthouse headset drift apart, how existing tools keep them aligned, and
which methods fit the first supported configuration: Quest 3 / 3S streamed with
Virtual Desktop into SteamVR, 2.0 base stations, Quest controllers in the hands,
Vive trackers on the body, no tracker on the headset.

Nothing has been measured on hardware yet. Code-level detail is in
[Space Calibrator Internals](./space-calibrator-internals.md) and
[QuestLHSync and OpenVR-SpaceSync Internals](./questlhsync-spacesync-internals.md).

## Evidence Levels

| Level | Meaning |
|---|---|
| **Verified** | Read in source code, with the reference given in the linked document, or measured on hardware in this project, with the conditions stated |
| **Stated by project** | A project's own README, wiki or store page; not checked against its code |
| **Reported** | A third-party article, guide, forum post or user report |
| **Hypothesis** | An unchecked idea or inference |

## Why the Spaces Drift Apart

### Jumps

- **Reported** — Quest recenters when the headset is put on; the space is
  centered where the headset was put on. ([Valve reply, Steam Link forum][valve-recenter])
- **Reported** — Quest sets its coordinates anew on every wake, and goes to sleep
  after a short time without movement. ([LIV guide][liv])
- **Reported** — Redrawing the guardian, resetting the play area, or moving a
  base station requires a new calibration. Valve: a calibration holds until room
  setup is redone on the Quest side or the PC side.
  ([note.com guide][shellbe], [Valve reply][valve-recenter])
- **Hypothesis** — Moving to another room, a lighting change, or SLAM
  relocalization also produces a jump. No report was found for Quest 3 with
  Virtual Desktop.

### Creep

- **Stated by project** — Quest SLAM "drifts in yaw and position", and reference
  poses are "occasionally poisoned by guardian shifts".
  ([charliee1w fork][charliee1w])
- **Stated by project** — Drift of world-locked content is more likely when moving
  across large areas. ([Meta help][meta-drift])
- **Reported** — Quest 3 absolute error is usually under a centimeter and exceeds
  10 cm in bad conditions. ([Duke, MobiCom'24][duke])
- **Reported** — With stage tracking working, one author recalibrated once in two
  to three months. ([note.com guide][shellbe])
- **Reported** — Even with a tracker on the headset, Space Calibrator shows spikes
  of 3–6 cm lasting about five seconds that then return.
  ([issue #50][sc-issue50])
- **Hypothesis** — A rotational error in the initial calibration grows into a
  position error with distance from the calibration spot, and reads as creep.

### Lighthouse Side

- **Reported** — After brief tracking losses the offset and tilt of the Vive
  coordinate system changed. ([Niehorster et al. 2017][niehorster])
- **Verified** — An occluded tracker can report a wrong pose as good. Measured
  2026-11-14: a VIVE Tracker 3.0 moved by hand, Quest 3 through Virtual Desktop,
  two SteamVR 2.0 base stations of which one was at times not tracking, recording
  `ovr-driftless-2026-11-14-160804.jsonl`. SteamVR marked the tracker
  out of tracking at 10.60 s, then reported `Running_OK` with a valid pose for
  10.83–11.15 s and 11.24–11.44 s while the pose ran off in a straight line at
  about 5 m/s, 2–3 m from the headset; it then marked it lost with the pose frozen
  3.5 m from the headset until 14.82 s, when the pose jumped back to the body
  (115 m/s between frames). The tracking flag alone does not tell good poses from
  bad, so any alignment method needs its own outlier rejection: speed a body part
  cannot reach, constant-velocity runs, distance from the body.

### Virtual Desktop Stage Tracking

- **Reported** — The option is "Center to play space (Stage tracking)" under
  Streaming → Advanced. ([note.com guide][kikjin])
- **Reported** — It makes Virtual Desktop use the STAGE reference space, which is
  tied to the guardian and in roomscale does not follow a system recenter.
  ([Steam forum][stage-totf])
- **Reported** — On Horizon OS v76–v78 this broke: a recenter happened on every
  headset removal even with stage tracking on. Whether it is fixed is unknown.
  ([Meta forum][stage-broken])
- **Verified** — Space Calibrator reads this setting and warns when it is off.
- **Hypothesis** — Stage tracking removes jumps from recentering. It does not
  remove jumps from a redrawn guardian, and it does not remove creep.

### Signals on the PC

- **Stated by project** — OpenVR defines `VREvent_ChaperoneUniverseHasChanged`,
  `VREvent_StandingZeroPoseReset`, `VREvent_SeatedZeroPoseReset` and
  `Prop_CurrentUniverseId_Uint64`. ([openvr.h][openvr-h])
- **Verified** — Space Calibrator clears its samples on these events and has a
  detector for jumps of a device's driver-to-world transform, off by default.
- Whether the Virtual Desktop driver raises any of these on a recenter or a
  guardian redraw was not found.

## Prior Art

| Project | Approach | Requires | Evidence |
|---|---|---|---|
| [pushrax/OpenVR-SpaceCalibrator][pushrax] | One-time manual calibration: a headset-side device and a Lighthouse device held together and moved | Manual repeat when the spaces drift | Stated by project |
| [hyblocker/OpenVR-SpaceCalibrator][hyblocker] | Maintained fork on [Steam][steam]; one-time and continuous calibration | Continuous mode is documented with a tracker on the headset; the code accepts any device pair | Verified, see [internals](./space-calibrator-internals.md) |
| bdunderscore/OpenVR-SpaceCalibrator | Introduced continuous calibration; has static recalibration from a saved device-pair pose | A rigid device pair | Reported |
| [charliee1w/OpenVR-SpaceCalibrator-Quest][charliee1w] | Quest-oriented fork: origin-shift detection, latency filtering | Tracker on the headset | Stated by project |
| [QuestLHSync][questlhsync-repo] | The headset's tracking cameras observe the base stations; a SteamVR driver solves yaw and translation continuously | Root on the headset; unconfirmed on Quest 3 / 3S | Verified, see [internals](./questlhsync-spacesync-internals.md) |
| [OpenVR-SpaceSync][spacesync-repo] | Driver and overlay. A no-tracker mode with one-time calibration, jump detection from the pose stream, and an optional "Stay Aligned" correction from a waist tracker | Waist tracker for "Stay Aligned"; no root, no tracker on the headset | Verified, see [internals](./questlhsync-spacesync-internals.md) |
| OpenVR-SpaceOverride, SteamVR tracking overrides | A tracker on the headset supplies the headset pose | Tracker on the headset; Quest controllers stop working | Reported ([note.com][gyokuto]) |

OpenVR-SpaceSync is the only existing tool found that addresses the first
supported configuration: no root and no tracker on the headset. It is beta, not
tested by its author on Quest 3 / 3S, and its remaining drift is not measured.

## Bridges for the First Supported Configuration

A bridge is something both tracking systems observe at the same time.

| Bridge | Finding | Evidence | Verdict |
|---|---|---|---|
| Tracker on the headset | The documented continuous mode | Stated by project | Excluded: no spare tracker |
| Controller rigidly joined to a tracker, permanently | Allowed by the Space Calibrator code. A Touch Plus controller outside the headset cameras' view runs on its IMU for a short time and degrades fast; a resting controller is expected to sleep | Verified (code), Reported ([Meta][meta-controllers]) | Not for a session: the tracker is detached after calibration |
| Controller touched to a worn tracker ("dock") | A saved device-pair pose gives a calibration from one pair of poses, without motion; bdunderscore's static recalibration does this | Reported | Fits: no new hardware, fixes jump and creep at the moment of contact |
| Emulated body trackers from Virtual Desktop | Virtual Desktop exposes Quest body tracking as SteamVR devices (`/devices/VirtualDesktop/hips` and others). The upper body is observed by the side cameras; the legs are generated, not observed. No project compares them with real trackers | Reported ([UploadVR][uploadvr-iobt], [Steam forum][vd-trackers]) | Possible coarse detector; accuracy unknown |
| Headset cameras through the Passthrough Camera API | Available on Quest 3 / 3S from Horizon OS v74, to the focused immersive app, and gives the front color cameras only. While Virtual Desktop is in focus another app cannot use it | Stated by project ([Meta][meta-pca]), Reported | Not during a session; possible as a companion app with printed markers, run between sessions |
| Headset tracking cameras see base stations | QuestLHSync reads the tracking cameras by injecting code into the headset's tracking service | Verified | Needs root, unconfirmed on Quest 3 / 3S; open item Q5 in the design document |
| Waist tracker under the head | OpenVR-SpaceSync "Stay Aligned" corrects yaw and translation from a worn waist tracker | Verified | Fits: the waist tracker is already worn |
| Spatial anchors, reference-space events | Available only to the focused immersive app | Stated by project ([Khronos][xr-event]), Hypothesis | Excluded while Virtual Desktop is in focus |

## Original Method Candidates

Ideas for alignment during a session, when nothing is rigidly attached across the
two systems. All are **Hypothesis**; none has been tested.

### Shared Simplification

- **Hypothesis** — Both tracking systems are aligned to gravity, so the transform
  between the spaces has four unknowns, not six: a rotation about the vertical
  axis and a translation.
- **Verified** — QuestLHSync and OpenVR-SpaceSync "Stay Aligned" are built on
  this assumption; both solve yaw and translation only.

### Candidates

| Candidate | Evidence it uses | Fixes | Related existing work |
|---|---|---|---|
| Jump cancellation | A head cannot move tens of centimeters in one frame. A discontinuity in the headset pose with no matching discontinuity in the Lighthouse devices is a shift of the headset origin; the size of the step is the correction | Jumps while the headset is worn | Space Calibrator's detector of driver-to-world jumps, off by default; OpenVR-SpaceSync and QuestLHSync detect jumps from the headset pose stream |
| Body-motion correlation | When the whole body moves, the head and a hip tracker share the same low-frequency velocity. Matching velocity directions gives the rotation; the average horizontal offset gives the translation | Creep, slowly and coarsely | OpenVR-SpaceSync "Stay Aligned" uses a waist tracker and a "pelvis under the head" model; experimental, reduces drift without removing it |
| Skeleton fit | A body skeleton follows the headset and controllers in one space and the worn trackers in the other. Bone lengths bound how far apart they can be; the strain left after inverse kinematics is the evidence of drift, and the transform that removes it is the correction. Generalizes body-motion correlation and floor agreement | Detects jump and creep; corrects coarsely | OpenVR-SpaceSync "Stay Aligned" uses the waist only; no full-skeleton alignment found |
| Floor agreement | The lowest height reached by foot trackers is the floor in Lighthouse space; the headset knows its own floor | Vertical creep | None found |
| Touch fix | The user brings a controller into contact with a worn tracker; proximity and zero relative motion mark the sample. A cradle that fixes the orientation makes one touch a full solution | Jump and creep, on demand, precisely | bdunderscore's static recalibration |
| Body-tracker comparison | Emulated body trackers from Virtual Desktop are compared with real trackers worn on the same body parts | Large jumps; creep doubtful | Standable snaps its estimated trackers to real ones at calibration |

A jump that happens while the headset is off cannot be recovered by jump
cancellation: the head pose is not continuous across that time.

### Combination

- **Hypothesis** — No single candidate covers everything. Jump cancellation
  handles recenters at once, body-motion correlation and floor agreement hold the
  long-term average, and a touch fix restores precision on demand.
- **Hypothesis** — Every candidate can be developed and scored offline on
  recorded sessions in which a tracker joined to a controller provides the true
  misalignment. The recordings of the [scene module](../design/scene/scene.md)
  are that data.

## Ranking

By cost to the user and by what is known, for the first supported configuration:

| Rank | Option | Cost to the user | Fixes | Confidence |
|---|---|---|---|---|
| 0 | Existing tool: OpenVR-SpaceSync in the no-tracker mode with "Stay Aligned" | None; a waist tracker is already worn | Jumps; reduces creep | It exists and is free to try; beta, untested on Quest 3 / 3S, not measured |
| 1 | Hygiene: stage tracking on, headset sleep prevented, guardian left alone; plus jump cancellation on the PC | None | Prevents and cancels jumps; no effect on creep | Medium; stage tracking was broken on Horizon OS v76–v78 |
| 2 | Touch fix on a worn tracker | A gesture when misalignment is noticed | Jump and creep | The math exists in other tools; no report of this use |
| 3 | Body-motion correlation, floor agreement | None | Creep | Low; untested |
| 4 | Body-tracker comparison | None | Large jumps | Low; no implementation, no measurement |
| 5 | Companion app with markers through the Passthrough Camera API | Printed markers, leaving Virtual Desktop for seconds | Jump and creep, by hand | The parts are documented; the whole is untested |
| 6 | Root, as in QuestLHSync | Root | Jump and creep, continuously | Untested on Quest 3 |

## Build Options

- **Verified** — Changing device poses in SteamVR needs a driver loaded into the
  runtime; Space Calibrator's driver is MIT-licensed and does this.
- **Verified** — Space Calibrator and QuestLHSync are MIT; their driver and
  solver code can be reused. OpenVR-SpaceSync is AGPL-3.0; its code cannot be
  taken into a product under a different license, though its ideas can be
  reimplemented.
- Start from the Space Calibrator 2.0 code, or write a new driver and
  application. The choice is not made; it belongs in an ADR.
- Whether the product is still needed depends on how OpenVR-SpaceSync performs in
  the first supported configuration; see Hardware Checks.

## Hardware Checks

Questions only a test on the hardware can settle. The scene module's live view
and recordings are the means for most of them.

1. Does stage tracking on the current headset firmware survive headset removal,
   sleep, and leaving the guardian?
2. What reaches the PC on a recenter and on a guardian redraw: an event, a
   universe ID change, a change of a device's driver-to-world transform, or only
   a discontinuity in the pose?
3. What does Virtual Desktop report for a Touch Plus controller outside the
   cameras' view and at rest: an invalid flag, or a frozen or extrapolated pose
   marked valid? How long until the controller sleeps?
4. What is the difference in latency and prediction between poses from Virtual
   Desktop and from Lighthouse?
5. How stable is the offset between an emulated body tracker and a real tracker on
   the same body part?
6. What is the real drift rate in the user's room, in millimeters and degrees per
   hour, and is it a jump or a creep?
7. Does the Lighthouse universe change when a base station is bumped?
8. How much misalignment remains over a session with OpenVR-SpaceSync in the
   no-tracker mode with "Stay Aligned", and what kind is it?

## Open Items

| ID | Question | Why it matters | Proposed default | Answer |
|----|----------|----------------|------------------|--------|
| Q1 | How does continuous calibration in the hyblocker fork estimate and update the transform? | Baseline algorithm; shows what a new approach must match or improve | — | A sliding buffer of pose pairs solved with Kabsch for rotation and least squares for translation; a solution is accepted when its RMS error is at most 0.1 m and no worse than the current one. See [internals](./space-calibrator-internals.md) |
| Q2 | Can headset cameras observe base stations without root, through an official camera API? | Decides whether the camera bridge is usable on stock Quest headsets | — | No known way. The official API gives the front color cameras only; QuestLHSync reads the tracking cameras through root. Whether the color cameras see the base stations at all is not established |
| Q3 | Do Steam Link, Virtual Desktop and ALVR forward hand-tracking poses to SteamVR accurately enough to serve as a bridge? | Decides whether a hand-tracking bridge needs no extra hardware | — | Virtual Desktop forwards hand joints and emulated body trackers to SteamVR; accuracy is not measured |
| Q4 | Does tracking on the Lighthouse side shift on its own during a session, or does all drift originate on the headset side? | If Lighthouse is stable, jump cancellation covers more cases | — | Reported to shift after brief tracking losses (Niehorster et al. 2017); not measured here |
| Q5 | Start from the Space Calibrator 2.0 code or write a new driver and application? | Decides the stack and how much existing behavior is inherited | — | — |

## Sources

- [pushrax/OpenVR-SpaceCalibrator][pushrax]
- [hyblocker/OpenVR-SpaceCalibrator][hyblocker], [issue #50][sc-issue50]
- [Space Calibrator on Steam][steam]
- [charliee1w/OpenVR-SpaceCalibrator-Quest][charliee1w]
- [CreoleVR/QuestLHSync][questlhsync-repo]
- [shinyflvre/OpenVR-SpaceSync][spacesync-repo]
- [LIV: Minimizing Playspace Drift with Quest Standalone and Lighthouse Tracking][liv]
- [Valve reply on recentering, Steam Link forum][valve-recenter]
- [Stage tracking discussion, Steam Link forum][stage-totf]
- [Stage tracking broken, Meta forum][stage-broken]
- [note.com: Quest and Lighthouse guide][shellbe], [note.com: Virtual Desktop settings][kikjin], [note.com: SpaceOverride][gyokuto]
- [Meta: drift of world-locked content][meta-drift]
- [Meta: controller best practices][meta-controllers]
- [Meta: Passthrough Camera API overview][meta-pca]
- [UploadVR: Virtual Desktop body tracking and Vive tracker emulation][uploadvr-iobt]
- [Virtual Desktop emulated trackers, SteamVR forum][vd-trackers]
- [Duke, MobiCom'24: Quest 3 tracking accuracy][duke]
- [Niehorster et al. 2017: accuracy of the HTC Vive][niehorster]
- [OpenVR header][openvr-h]
- [Khronos: XrEventDataReferenceSpaceChangePending][xr-event]

[pushrax]: https://github.com/pushrax/OpenVR-SpaceCalibrator
[hyblocker]: https://github.com/hyblocker/OpenVR-SpaceCalibrator
[sc-issue50]: https://github.com/hyblocker/OpenVR-SpaceCalibrator/issues/50
[steam]: https://store.steampowered.com/app/3368750/Space_Calibrator
[charliee1w]: https://github.com/charliee1w/OpenVR-SpaceCalibrator-Quest
[questlhsync-repo]: https://github.com/CreoleVR/QuestLHSync
[spacesync-repo]: https://github.com/shinyflvre/OpenVR-SpaceSync
[liv]: https://help.liv.tv/hc/en-us/articles/19481693730962
[valve-recenter]: https://steamcommunity.com/app/353380/discussions/11/4038102696019795245
[stage-totf]: https://steamcommunity.com/app/353380/discussions/11/4029096483732972771
[stage-broken]: https://communityforums.atmeta.com/discussions/OtherTroubleshooting/stage-tracking-option-has-been-broken/1334647
[shellbe]: https://note.com/shellbe/n/nda8ec91d6b50?hl=en
[kikjin]: https://note.com/kikjin/n/nd81d2097a849?hl=en
[gyokuto]: https://note.com/gyokuto15/n/n1011caf39da1?hl=en
[meta-drift]: https://www.meta.com/help/quest/888109563496119/
[meta-controllers]: https://developers.meta.com/vr/design/controllers-best-practices/
[meta-pca]: https://developers.meta.com/horizon/documentation/unity/unity-pca-overview/
[uploadvr-iobt]: https://www.uploadvr.com/virtual-desktop-quest-3-inside-out-body-tracking-vive-tracker-emulation/
[vd-trackers]: https://steamcommunity.com/app/250820/discussions/2/604170759802491308/
[duke]: https://par.nsf.gov/biblio/10634403
[niehorster]: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5439658/
[openvr-h]: https://raw.githubusercontent.com/ValveSoftware/openvr/master/headers/openvr.h
[xr-event]: https://registry.khronos.org/OpenXR/specs/1.1/man/html/XrEventDataReferenceSpaceChangePending.html
