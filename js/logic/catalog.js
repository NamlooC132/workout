// Built-in exercise catalog: common gym exercises with their muscles already set up.
// Catalog exercises are only added to YOUR library when you pick one, so it stays tidy.
//
// "How to" links point to the SimplyFitness guide for that exercise when one exists,
// otherwise to a YouTube search. Pictures are not copied – the link opens the guide.
//
// Row format: [name, type, equipment, category, muscles, repMin, repMax, restSeconds, guideSlug, extra]
// muscles: "code:share" pairs – c chest · b back · fd/sd/rd front/side/rear delts · bi biceps · tri triceps
//          q quads · h hamstrings · g glutes · ca calves · ab abs · tr traps · fa forearms · ad adductors

const CODES = {
  c: 'chest', b: 'back', fd: 'front_delts', sd: 'side_delts', rd: 'rear_delts', bi: 'biceps', tri: 'triceps',
  q: 'quads', h: 'hamstrings', g: 'glutes', ca: 'calves', ab: 'abs', tr: 'traps', fa: 'forearms', ad: 'adductors',
};

const DB = { loadMode: 'per_hand' };
const UNI = { unilateral: true };
const DB_UNI = { loadMode: 'per_hand', unilateral: true };

const ROWS = [
  // ---------- Chest ----------
  ['Bench Press', 'weighted', 'Barbell', 'Compound', 'c:1 tri:.5 fd:.5', 6, 10, 150, 'barbell-bench-press'],
  ['Incline Bench Press', 'weighted', 'Barbell', 'Compound', 'c:1 fd:.5 tri:.5', 6, 10, 150, 'incline-barbell-bench-press'],
  ['Decline Bench Press', 'weighted', 'Barbell', 'Compound', 'c:1 tri:.5', 6, 10, 150, 'barbell-declined-bench-press'],
  ['Close-Grip Bench Press', 'weighted', 'Barbell', 'Compound', 'tri:1 c:.5 fd:.5', 6, 10, 120, 'close-grip-bench-press'],
  ['Dumbbell Bench Press', 'dumbbell', 'Dumbbell', 'Compound', 'c:1 tri:.5 fd:.5', 8, 12, 120, 'dumbbell-bench-press', DB],
  ['Incline Dumbbell Press', 'dumbbell', 'Dumbbell', 'Compound', 'c:1 fd:.5 tri:.5', 8, 12, 120, 'incline-dumbbell-bench-press', DB],
  ['Decline Dumbbell Press', 'dumbbell', 'Dumbbell', 'Compound', 'c:1 tri:.5', 8, 12, 120, 'dumbbell-declined-bench-press', DB],
  ['Machine Chest Press', 'weighted', 'Machine', 'Compound', 'c:1 tri:.5 fd:.5', 8, 12, 90, 'chest-press-machine'],
  ['Smith Machine Bench Press', 'weighted', 'Smith machine', 'Compound', 'c:1 tri:.5 fd:.5', 6, 10, 120, null],
  ['Smith Machine Incline Press', 'weighted', 'Smith machine', 'Compound', 'c:1 fd:.5 tri:.5', 6, 10, 120, null],
  ['Dumbbell Fly', 'dumbbell', 'Dumbbell', 'Isolation', 'c:1', 10, 15, 75, 'dumbbell-fly', DB],
  ['Incline Dumbbell Fly', 'dumbbell', 'Dumbbell', 'Isolation', 'c:1', 10, 15, 75, 'incline-dumbbell-fly', DB],
  ['Pec Deck', 'weighted', 'Machine', 'Isolation', 'c:1', 10, 15, 75, 'peck-deck'],
  ['Cable Fly', 'weighted', 'Cable', 'Isolation', 'c:1', 10, 15, 75, 'cable-crossover'],
  ['Seated Cable Fly', 'weighted', 'Cable', 'Isolation', 'c:1', 10, 15, 75, null],
  ['Push-Up', 'bodyweight', 'Bodyweight', 'Compound', 'c:1 tri:.5 fd:.5', 10, 20, 60, 'push-ups'],
  ['Dips', 'weighted_bw', 'Bodyweight', 'Compound', 'c:1 tri:1 fd:.5', 8, 12, 90, 'parallel-dip-bar'],
  ['Assisted Dip', 'assisted', 'Machine', 'Compound', 'c:1 tri:1 fd:.5', 8, 12, 90, null],
  ['Dumbbell Pullover', 'dumbbell', 'Dumbbell', 'Isolation', 'c:1 b:.5', 10, 12, 75, 'dumbbell-pullover'],

  // ---------- Shoulders ----------
  ['Overhead Press', 'weighted', 'Barbell', 'Compound', 'fd:1 tri:.5 sd:.5', 6, 10, 120, 'standing-barbell-shoulder-press'],
  ['Seated Barbell Shoulder Press', 'weighted', 'Barbell', 'Compound', 'fd:1 tri:.5 sd:.5', 6, 10, 120, 'seated-barbell-shoulder-press'],
  ['Dumbbell Shoulder Press', 'dumbbell', 'Dumbbell', 'Compound', 'fd:1 tri:.5 sd:.5', 8, 12, 90, 'dumbbell-shoulder-press', DB],
  ['Arnold Press', 'dumbbell', 'Dumbbell', 'Compound', 'fd:1 sd:.5 tri:.5', 8, 12, 90, null, DB],
  ['Machine Shoulder Press', 'weighted', 'Machine', 'Compound', 'fd:1 tri:.5 sd:.5', 8, 12, 90, null],
  ['Smith Machine Shoulder Press', 'weighted', 'Smith machine', 'Compound', 'fd:1 tri:.5 sd:.5', 8, 12, 90, 'smith-machine-shoulder-press'],
  ['Push Press', 'weighted', 'Barbell', 'Compound', 'fd:1 tri:.5', 5, 8, 120, 'barbell-push-press'],
  ['Landmine Press', 'weighted', 'Barbell', 'Compound', 'fd:1 c:.5 tri:.5', 8, 12, 90, null],
  ['Lateral Raise', 'dumbbell', 'Dumbbell', 'Isolation', 'sd:1', 12, 20, 60, 'dumbbell-lateral-raise', DB],
  ['Cable Lateral Raise', 'weighted', 'Cable', 'Isolation', 'sd:1', 12, 20, 60, 'cable-one-arm-lateral-raise'],
  ['Machine Lateral Raise', 'weighted', 'Machine', 'Isolation', 'sd:1', 12, 20, 60, null],
  ['Dumbbell Front Raise', 'dumbbell', 'Dumbbell', 'Isolation', 'fd:1', 10, 15, 60, 'dumbbell-front-raise', DB],
  ['Cable Front Raise', 'weighted', 'Cable', 'Isolation', 'fd:1', 10, 15, 60, 'single-arm-cable-front-raise'],
  ['Barbell Upright Row', 'weighted', 'Barbell', 'Compound', 'sd:1 tr:.5', 10, 12, 75, 'barbell-upright-row'],
  ['Face Pull', 'weighted', 'Cable', 'Isolation', 'rd:1 tr:.5', 12, 15, 60, null],
  ['Reverse Pec Deck', 'weighted', 'Machine', 'Isolation', 'rd:1', 12, 20, 60, null],
  ['Reverse Dumbbell Fly', 'dumbbell', 'Dumbbell', 'Isolation', 'rd:1', 12, 20, 60, 'bent-over-lateral-raise', DB],
  ['Reverse Cable Fly', 'weighted', 'Cable', 'Isolation', 'rd:1', 12, 20, 60, 'high-cable-rear-delt-fly'],

  // ---------- Biceps ----------
  ['Barbell Curl', 'weighted', 'Barbell', 'Isolation', 'bi:1', 8, 12, 60, 'barbell-curl'],
  ['EZ Bar Curl', 'weighted', 'Barbell', 'Isolation', 'bi:1', 8, 12, 60, 'ez-barbell-curl'],
  ['Dumbbell Curl', 'dumbbell', 'Dumbbell', 'Isolation', 'bi:1', 8, 12, 60, 'alternating-dumbbell-curl', DB],
  ['Hammer Curl', 'dumbbell', 'Dumbbell', 'Isolation', 'bi:1 fa:.5', 10, 12, 60, 'hammer-curl', DB],
  ['Incline Dumbbell Curl', 'dumbbell', 'Dumbbell', 'Isolation', 'bi:1', 8, 12, 60, 'incline-dumbbell-curl', DB],
  ['Preacher Curl', 'weighted', 'Barbell', 'Isolation', 'bi:1', 8, 12, 60, 'ez-barbell-preacher-curl'],
  ['Dumbbell Preacher Curl', 'dumbbell', 'Dumbbell', 'Isolation', 'bi:1', 8, 12, 60, null, DB],
  ['Machine Bicep Curl', 'weighted', 'Machine', 'Isolation', 'bi:1', 8, 12, 60, null],
  ['Concentration Curl', 'dumbbell', 'Dumbbell', 'Isolation', 'bi:1', 10, 12, 60, 'dumbbell-concentration-curl', DB],
  ['Cable Curl', 'weighted', 'Cable', 'Isolation', 'bi:1', 10, 12, 60, 'straight-bar-low-pulley-cable-curl'],
  ['Rope Cable Curl', 'weighted', 'Cable', 'Isolation', 'bi:1 fa:.5', 10, 12, 60, 'rope-cable-curl'],
  ['Bayesian Curl', 'weighted', 'Cable', 'Isolation', 'bi:1', 10, 15, 60, 'single-arm-low-pulley-cable-curl'],
  ['Overhead Cable Curl', 'weighted', 'Cable', 'Isolation', 'bi:1', 10, 15, 60, 'standing-high-pulley-cable-curl'],
  ['Spider Curl', 'dumbbell', 'Dumbbell', 'Isolation', 'bi:1', 10, 12, 60, null, DB],
  ['Reverse Barbell Curl', 'weighted', 'Barbell', 'Isolation', 'fa:1 bi:.5', 10, 15, 60, 'reverse-barbell-curl'],

  // ---------- Triceps ----------
  ['Triceps Pushdown', 'weighted', 'Cable', 'Isolation', 'tri:1', 10, 15, 60, 'triceps-pressdown'],
  ['Rope Pushdown', 'weighted', 'Cable', 'Isolation', 'tri:1', 10, 15, 60, 'cable-rope-puschdown'],
  ['Overhead Triceps Extension', 'weighted', 'Cable', 'Isolation', 'tri:1', 10, 15, 60, null],
  ['Dumbbell Overhead Triceps Extension', 'dumbbell', 'Dumbbell', 'Isolation', 'tri:1', 10, 15, 60, 'dumbbell-overhead-triceps-extension'],
  ['Skull Crusher', 'weighted', 'Barbell', 'Isolation', 'tri:1', 8, 12, 75, 'lying-triceps-extension'],
  ['Dumbbell Skull Crusher', 'dumbbell', 'Dumbbell', 'Isolation', 'tri:1', 10, 12, 75, 'lying-dumbbell-triceps-extension', DB],
  ['Triceps Kickback', 'dumbbell', 'Dumbbell', 'Isolation', 'tri:1', 12, 15, 60, 'kickback', DB],
  ['Single-Arm Cable Extension', 'weighted', 'Cable', 'Isolation', 'tri:1', 12, 15, 60, 'single-arm-cable-triceps-extension'],
  ['Machine Triceps Extension', 'weighted', 'Machine', 'Isolation', 'tri:1', 10, 15, 60, null],
  ['Close-Grip Push-Up', 'bodyweight', 'Bodyweight', 'Compound', 'tri:1 c:.5', 10, 20, 60, null],
  ['Bench Dip', 'bodyweight', 'Bodyweight', 'Compound', 'tri:1 fd:.5', 10, 20, 60, 'bench-dips'],

  // ---------- Quads ----------
  ['Squat', 'weighted', 'Barbell', 'Compound', 'q:1 g:.5', 5, 8, 180, 'squat', { warmupSets: 2 }],
  ['Front Squat', 'weighted', 'Barbell', 'Compound', 'q:1 g:.5', 5, 8, 180, 'front-squat'],
  ['Hack Squat', 'weighted', 'Machine', 'Compound', 'q:1 g:.5', 8, 12, 120, 'hack-squat'],
  ['Pendulum Squat', 'weighted', 'Machine', 'Compound', 'q:1 g:.5', 8, 12, 120, null],
  ['Smith Machine Squat', 'weighted', 'Smith machine', 'Compound', 'q:1 g:.5', 8, 12, 120, null],
  ['Belt Squat', 'weighted', 'Machine', 'Compound', 'q:1 g:.5', 8, 12, 120, null],
  ['Goblet Squat', 'dumbbell', 'Dumbbell', 'Compound', 'q:1 g:.5', 8, 15, 90, 'dumbbell-goblet-squat'],
  ['Leg Press', 'weighted', 'Machine', 'Compound', 'q:1 g:.5', 10, 12, 120, 'leg-press'],
  ['Bulgarian Split Squat', 'dumbbell', 'Dumbbell', 'Compound', 'q:1 g:1', 8, 12, 90, 'barbell-bulgarian-split-squat', DB_UNI],
  ['Walking Lunge', 'dumbbell', 'Dumbbell', 'Compound', 'q:1 g:1', 8, 12, 90, 'lunge', DB],
  ['Reverse Lunge', 'dumbbell', 'Dumbbell', 'Compound', 'q:1 g:1', 8, 12, 90, null, DB_UNI],
  ['Step-Up', 'dumbbell', 'Dumbbell', 'Compound', 'q:1 g:1', 8, 12, 90, 'dumbbell-step-up', DB_UNI],
  ['Leg Extension', 'weighted', 'Machine', 'Isolation', 'q:1', 10, 15, 75, 'leg-extension'],
  ['Single-Leg Extension', 'weighted', 'Machine', 'Isolation', 'q:1', 10, 15, 60, 'single-leg-extension', UNI],

  // ---------- Hamstrings & glutes ----------
  ['Romanian Deadlift', 'weighted', 'Barbell', 'Compound', 'h:1 g:.5 b:.5', 8, 10, 120, 'barbell-stiff-leg-deadlift'],
  ['Dumbbell Romanian Deadlift', 'dumbbell', 'Dumbbell', 'Compound', 'h:1 g:.5 b:.5', 8, 12, 120, 'dumbbell-stiff-leg-deadlift', DB],
  ['Stiff-Legged Deadlift', 'weighted', 'Barbell', 'Compound', 'h:1 g:.5 b:.5', 8, 10, 120, 'barbell-stiff-leg-deadlift'],
  ['Good Morning', 'weighted', 'Barbell', 'Compound', 'h:1 g:.5 b:.5', 8, 12, 120, 'good-morning'],
  ['Leg Curl', 'weighted', 'Machine', 'Isolation', 'h:1', 10, 12, 75, 'lying-leg-curl'],
  ['Lying Leg Curl', 'weighted', 'Machine', 'Isolation', 'h:1', 10, 12, 75, 'lying-leg-curl'],
  ['Seated Leg Curl', 'weighted', 'Machine', 'Isolation', 'h:1', 10, 12, 75, 'seated-leg-curl'],
  ['Nordic Hamstring Curl', 'bodyweight', 'Bodyweight', 'Isolation', 'h:1', 4, 8, 90, null],
  ['Glute Ham Raise', 'bodyweight', 'Machine', 'Compound', 'h:1 g:.5', 6, 12, 90, 'glute-ham-raise'],
  ['Hip Thrust', 'weighted', 'Barbell', 'Compound', 'g:1 h:.5', 8, 12, 90, 'barbell-hip-thrust'],
  ['Hip Thrust Machine', 'weighted', 'Machine', 'Compound', 'g:1 h:.5', 8, 12, 90, null],
  ['Smith Machine Hip Thrust', 'weighted', 'Smith machine', 'Compound', 'g:1 h:.5', 8, 12, 90, 'smith-machine-hip-thrust'],
  ['Glute Bridge', 'weighted', 'Barbell', 'Isolation', 'g:1', 10, 15, 75, 'bodyweight-glute-bridge'],
  ['Cable Glute Kickback', 'weighted', 'Cable', 'Isolation', 'g:1', 12, 15, 60, 'standing-cable-kickback', UNI],
  ['Cable Pull-Through', 'weighted', 'Cable', 'Compound', 'g:1 h:.5', 10, 15, 75, null],
  ['Hip Abduction Machine', 'weighted', 'Machine', 'Isolation', 'g:1', 12, 20, 60, 'seated-hip-abduction-machine'],
  ['Hip Adduction Machine', 'weighted', 'Machine', 'Isolation', 'ad:1', 12, 20, 60, null],
  ['Back Extension', 'weighted_bw', 'Bodyweight', 'Compound', 'g:1 h:.5 b:.5', 10, 15, 75, null],
  ['Reverse Hyperextension', 'weighted', 'Machine', 'Compound', 'g:1 h:.5', 10, 15, 75, null],
  ['Kettlebell Swing', 'weighted', 'Kettlebell', 'Compound', 'g:1 h:.5', 12, 20, 75, 'kettlebell-swings'],

  // ---------- Calves ----------
  ['Calf Raise', 'weighted', 'Machine', 'Isolation', 'ca:1', 12, 15, 60, 'standing-calf-raise'],
  ['Standing Calf Raise', 'weighted', 'Machine', 'Isolation', 'ca:1', 10, 15, 60, 'standing-calf-raise'],
  ['Seated Calf Raise', 'weighted', 'Machine', 'Isolation', 'ca:1', 12, 20, 60, 'seated-calf-raise'],
  ['Leg Press Calf Raise', 'weighted', 'Machine', 'Isolation', 'ca:1', 12, 20, 60, null],

  // ---------- Back ----------
  ['Deadlift', 'weighted', 'Barbell', 'Compound', 'b:1 h:.5 g:.5', 3, 6, 180, 'barbell-deadlift', { warmupSets: 2 }],
  ['Sumo Deadlift', 'weighted', 'Barbell', 'Compound', 'g:1 q:.5 b:.5 ad:.5', 3, 6, 180, 'barbell-sumo-deadlift'],
  ['Trap Bar Deadlift', 'weighted', 'Barbell', 'Compound', 'g:1 q:.5 b:.5 h:.5', 4, 8, 180, 'trap-bar-deadlift'],
  ['Rack Pull', 'weighted', 'Barbell', 'Compound', 'b:1 tr:.5 g:.5', 4, 8, 150, null],
  ['Pull-up', 'weighted_bw', 'Bodyweight', 'Compound', 'b:1 bi:.5 rd:.5', 6, 10, 120, 'pull-up'],
  ['Chin-Up', 'weighted_bw', 'Bodyweight', 'Compound', 'b:1 bi:1', 6, 10, 120, 'pull-up-with-a-supinated-grip'],
  ['Assisted Pull-Up', 'assisted', 'Machine', 'Compound', 'b:1 bi:.5 rd:.5', 8, 12, 90, null],
  ['Lat Pulldown', 'weighted', 'Cable', 'Compound', 'b:1 bi:.5', 8, 12, 90, 'wide-grip-pulldown'],
  ['Close-Grip Lat Pulldown', 'weighted', 'Cable', 'Compound', 'b:1 bi:.5', 8, 12, 90, 'close-grip-pulldown'],
  ['Reverse-Grip Lat Pulldown', 'weighted', 'Cable', 'Compound', 'b:1 bi:.5', 8, 12, 90, 'reverse-grip-pulldown'],
  ['Single-Arm Lat Pulldown', 'weighted', 'Cable', 'Compound', 'b:1 bi:.5', 10, 12, 75, null],
  ['Machine Lat Pulldown', 'weighted', 'Machine', 'Compound', 'b:1 bi:.5', 8, 12, 90, null],
  ['Straight-Arm Pulldown', 'weighted', 'Cable', 'Isolation', 'b:1', 10, 15, 60, 'straight-arm-lat-pulldown'],
  ['Barbell Row', 'weighted', 'Barbell', 'Compound', 'b:1 bi:.5 rd:.5', 6, 10, 120, 'barbell-row'],
  ['Pendlay Row', 'weighted', 'Barbell', 'Compound', 'b:1 bi:.5 rd:.5', 5, 8, 120, null],
  ['Dumbbell Row', 'dumbbell', 'Dumbbell', 'Compound', 'b:1 bi:.5 rd:.5', 8, 12, 90, 'dumbbell-bent-over-row-single-arm'],
  ['Chest-Supported Dumbbell Row', 'dumbbell', 'Dumbbell', 'Compound', 'b:1 rd:.5 bi:.5', 8, 12, 90, null, DB],
  ['T-Bar Row', 'weighted', 'Barbell', 'Compound', 'b:1 bi:.5 rd:.5', 8, 12, 120, 't-bar-rows'],
  ['Seated Cable Row', 'weighted', 'Cable', 'Compound', 'b:1 bi:.5 rd:.5', 10, 12, 90, 'seated-cable-row'],
  ['Wide-Grip Cable Row', 'weighted', 'Cable', 'Compound', 'b:1 rd:.5 bi:.5', 10, 12, 90, null],
  ['Single-Arm Cable Row', 'weighted', 'Cable', 'Compound', 'b:1 bi:.5', 10, 12, 75, null],
  ['Seated Machine Row', 'weighted', 'Machine', 'Compound', 'b:1 bi:.5 rd:.5', 8, 12, 90, null],
  ['Seal Row', 'weighted', 'Barbell', 'Compound', 'b:1 rd:.5 bi:.5', 8, 12, 90, null],
  ['Kroc Row', 'dumbbell', 'Dumbbell', 'Compound', 'b:1 bi:.5', 12, 20, 90, null],
  ['Inverted Row', 'bodyweight', 'Bodyweight', 'Compound', 'b:1 bi:.5 rd:.5', 8, 15, 75, null],
  ['Barbell Shrug', 'weighted', 'Barbell', 'Isolation', 'tr:1', 10, 15, 60, 'barbell-shrug'],
  ['Dumbbell Shrug', 'dumbbell', 'Dumbbell', 'Isolation', 'tr:1', 10, 15, 60, 'dumbbell-shrugs', DB],

  // ---------- Abs ----------
  ['Cable Crunch', 'weighted', 'Cable', 'Isolation', 'ab:1', 10, 15, 60, 'rope-ab-pulldown'],
  ['Machine Crunch', 'weighted', 'Machine', 'Isolation', 'ab:1', 10, 15, 60, 'crunch-machine'],
  ['Crunch', 'bodyweight', 'Bodyweight', 'Isolation', 'ab:1', 15, 25, 45, 'crunch'],
  ['Hanging Leg Raise', 'bodyweight', 'Bodyweight', 'Isolation', 'ab:1', 10, 15, 60, 'hanging-leg-raise'],
  ['Hanging Knee Raise', 'bodyweight', 'Bodyweight', 'Isolation', 'ab:1', 10, 20, 60, null],
  ['Captain’s Chair Leg Raise', 'bodyweight', 'Bodyweight', 'Isolation', 'ab:1', 10, 20, 60, null],
  ['Lying Leg Raise', 'bodyweight', 'Bodyweight', 'Isolation', 'ab:1', 12, 20, 45, null],
  ['Reverse Crunch', 'bodyweight', 'Bodyweight', 'Isolation', 'ab:1', 12, 20, 45, 'bent-knee-reverse-crunch'],
  ['Ab Wheel Rollout', 'bodyweight', 'Other', 'Isolation', 'ab:1', 8, 15, 60, null],
  ['Sit-Up', 'bodyweight', 'Bodyweight', 'Isolation', 'ab:1', 12, 20, 45, null],
  ['Bicycle Crunch', 'bodyweight', 'Bodyweight', 'Isolation', 'ab:1', 15, 30, 45, null],
  ['Oblique Crunch', 'bodyweight', 'Bodyweight', 'Isolation', 'ab:1', 12, 20, 45, 'oblique-crunch'],
  ['Dumbbell Side Bend', 'dumbbell', 'Dumbbell', 'Isolation', 'ab:1', 12, 15, 45, null, UNI],
  ['Pallof Press', 'weighted', 'Cable', 'Isolation', 'ab:1', 10, 15, 45, null, UNI],
  ['Cable Woodchop', 'weighted', 'Cable', 'Isolation', 'ab:1', 10, 15, 45, null, UNI],
  ['Plank', 'bodyweight', 'Bodyweight', 'Isolation', 'ab:1', 30, 60, 60, 'plank', { notes: 'Log seconds in the reps field' }],
  ['Dead Bug', 'bodyweight', 'Bodyweight', 'Isolation', 'ab:1', 10, 20, 45, null],

  // ---------- Forearms ----------
  ['Wrist Curl', 'weighted', 'Barbell', 'Isolation', 'fa:1', 12, 20, 45, 'seated-barbell-wrist-curl'],
  ['Wrist Extension', 'weighted', 'Barbell', 'Isolation', 'fa:1', 12, 20, 45, 'seated-barbell-wrist-extension'],
  ['Farmer’s Walk', 'dumbbell', 'Dumbbell', 'Compound', 'fa:1 tr:1', 20, 40, 90, null, { loadMode: 'per_hand', notes: 'Log steps (or metres) in the reps field' }],
];

function parseMuscles(s) {
  const out = {};
  for (const part of s.split(/\s+/)) {
    const [code, v] = part.split(':');
    out[CODES[code]] = Number(v);
  }
  return out;
}

export const CATALOG = ROWS.map(([name, type, equipment, category, muscles, repMin, repMax, rest, slug, extra = {}]) => ({
  name, type, equipment, category,
  muscles: parseMuscles(muscles),
  repMin, repMax, rest, sets: 3,
  loadMode: extra.loadMode || 'total',
  unilateral: !!extra.unilateral,
  warmupSets: extra.warmupSets || 0,
  notes: extra.notes || '',
  guide: slug ? `https://www.simplyfitness.com/pages/${slug}` : null,
}));

const BY_NAME = new Map(CATALOG.map((c) => [c.name.toLowerCase(), c]));

export function catalogEntry(name) {
  return BY_NAME.get(String(name || '').trim().toLowerCase()) || null;
}

/** Best "how to" link for an exercise: its own link, the catalog guide, or a video search. */
export function guideFor(exercise) {
  if (!exercise) return null;
  if (exercise.guide) return exercise.guide;
  const c = catalogEntry(exercise.name);
  if (c && c.guide) return c.guide;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise.name} exercise how to`)}`;
}

export const CATALOG_CODES = CODES;
