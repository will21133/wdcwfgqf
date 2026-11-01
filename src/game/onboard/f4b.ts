// F4b's entry (ONBOARD2 §11.3): the coach, the death card, the rewind guide, the Rehearsal Hall,
// the late ladder and F4b's debug routes / __tut fields. Importing this file wires them all up.
// It is imported by ui/pause.ts (the only F4b-owned file every scene loads); at merge the lead may
// move the import into onboard/index.ts next to F4a's './calm' and './debug'.
import './coach/coach';
import './coach/mastery';
import './coach/deathTape';
import './coach/deathCard';
import './coach/debug';
import '../ui/rewindGuide';
import './lessons/advanced';
import '../rooms/rehearsal';
import '../ui/rehearsalBoard';
import './ladder';
import './coach/seat';
