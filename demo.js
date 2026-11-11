// Demo mode data: lets you test the whole app without an API key.
// Start with:  node server.js --demo   (or DEMO_MODE=1 node server.js)

const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function summary(info) {
  info = info || {};
  return {
    title: 'Photosynthesis',
    overview:
      'Photosynthesis converts light energy into chemical energy stored in glucose, releasing oxygen on the way. ' +
      'It runs in two linked stages: the light-dependent reactions, which capture energy, and the Calvin cycle, which uses it to build sugar.',
    sections: [
      {
        heading: 'The big picture',
        points: [
          'Plants, algae and some bacteria use **light energy** to turn carbon dioxide and water into **glucose** and oxygen.',
          'It happens in two linked stages: the **light-dependent reactions** and the **Calvin cycle**.',
          'The light reactions make the energy carriers `ATP` and `NADPH`; the Calvin cycle spends them to build sugar.',
        ],
        diagram: {
          title: 'Overview of photosynthesis',
          mermaid:
            'flowchart LR\nA["Sunlight"] --> B["Light reactions in thylakoids"]\nC["Water"] --> B\nB --> D["ATP and NADPH"]\nB --> E["Oxygen released"]\nD --> F["Calvin cycle in stroma"]\nG["Carbon dioxide"] --> F\nF --> H["Glucose"]',
        },
      },
      {
        heading: 'Light-dependent reactions',
        points: [
          'Occur in the **thylakoid membranes** of the chloroplast.',
          '**Chlorophyll** absorbs mostly red and blue light, which is why leaves look green.',
          'Water is split to supply electrons; the oxygen released comes from **water**, not from carbon dioxide.',
          'A proton gradient across the thylakoid membrane drives **ATP synthase** to make `ATP`.',
          'Cyclic electron flow around photosystem I makes extra `ATP` only (no `NADPH`, no oxygen).',
        ],
        diagram: null,
      },
      {
        heading: 'The Calvin cycle',
        points: [
          'Takes place in the **stroma** and does not use light directly.',
          '**RuBisCO** fixes carbon dioxide onto RuBP, forming 3-PGA.',
          '`ATP` and `NADPH` reduce 3-PGA to **G3P**, a three-carbon sugar.',
          'Most G3P is used to regenerate RuBP so the cycle can continue; the rest becomes glucose.',
        ],
        diagram: {
          title: 'Calvin cycle steps',
          mermaid:
            'flowchart TD\nA["CO2 fixation by RuBisCO"] --> B["3-PGA"]\nB --> C["Reduction using ATP and NADPH"]\nC --> D["G3P"]\nD --> E["Glucose made"]\nD --> F["RuBP regenerated"]\nF --> A',
        },
      },
      {
        heading: 'Factors affecting the rate',
        points: [
          '**Light intensity:** the rate rises, then plateaus once another factor becomes limiting.',
          '**Carbon dioxide concentration:** more CO2 raises the rate until enzymes are saturated.',
          '**Temperature:** enzymes such as RuBisCO work best in a range; very high temperatures reduce the rate.',
          'On hot, dry days plants close their **stomata**, which lowers internal CO2 and favours photorespiration.',
        ],
        diagram: null,
      },
    ],
    technical: [
      '6CO2 + 6H2O + light energy -> C6H12O6 + 6O2',
      'Light reactions: 2H2O -> 4H+ + 4e- + O2',
      'Calvin cycle: 3CO2 + 9ATP + 6NADPH -> 1 G3P',
    ],
    keyTerms: [
      { term: 'Chlorophyll', definition: 'Green pigment that absorbs light for photosynthesis.' },
      { term: 'Thylakoid', definition: 'Membrane sacs in the chloroplast where the light reactions happen.' },
      { term: 'Stroma', definition: 'Fluid of the chloroplast where the Calvin cycle runs.' },
      { term: 'ATP', definition: 'Energy-carrying molecule made in the light reactions.' },
      { term: 'NADPH', definition: 'Electron carrier that supplies reducing power to the Calvin cycle.' },
      { term: 'RuBisCO', definition: 'Enzyme that fixes carbon dioxide in the Calvin cycle.' },
      { term: 'Stomata', definition: 'Leaf pores that control gas exchange.' },
    ],
  };
}

// The correct answer is always listed first here; it is shuffled when the quiz is built.
const BANK = [
  { d: 'Easy', q: 'Which gas do plants take in for photosynthesis?', o: ['Carbon dioxide', 'Oxygen', 'Nitrogen', 'Hydrogen'], e: 'Plants fix carbon dioxide in the Calvin cycle to build sugars.' },
  { d: 'Easy', q: 'Which pigment captures light energy in photosynthesis?', o: ['Chlorophyll', 'Hemoglobin', 'Melanin', 'Keratin'], e: 'Chlorophyll absorbs mainly red and blue light.' },
  { d: 'Easy', q: 'Which organelle carries out photosynthesis?', o: ['Chloroplast', 'Mitochondrion', 'Nucleus', 'Ribosome'], e: 'Chloroplasts contain the chlorophyll and the thylakoid and stroma compartments.' },
  { d: 'Easy', q: 'What is the main sugar product of photosynthesis?', o: ['Glucose', 'Lactose', 'Ethanol', 'Ammonia'], e: 'The overall equation produces glucose (C6H12O6).' },
  { d: 'Easy', q: 'Which gas is released as a by-product of photosynthesis?', o: ['Oxygen', 'Methane', 'Nitrogen', 'Carbon monoxide'], e: 'Oxygen is released when water is split in the light reactions.' },
  { d: 'Easy', q: 'Where do the light-dependent reactions take place?', o: ['Thylakoid membranes', 'Stroma', 'Cell wall', 'Vacuole'], e: 'The photosystems and electron transport chain sit in the thylakoid membranes.' },
  { d: 'Easy', q: 'What is the main job of stomata?', o: ['Gas exchange', 'Storing water', 'Absorbing light', 'Anchoring the plant'], e: 'Stomata let CO2 in and O2 and water vapour out.' },
  { d: 'Medium', q: 'Where does the Calvin cycle occur?', o: ['In the stroma', 'In the thylakoid lumen', 'In the nucleus', 'In the cell membrane'], e: 'The enzymes of the Calvin cycle are dissolved in the stroma.' },
  { d: 'Medium', q: 'Which enzyme fixes carbon dioxide in the Calvin cycle?', o: ['RuBisCO', 'ATP synthase', 'Amylase', 'Catalase'], e: 'RuBisCO attaches CO2 to RuBP.' },
  { d: 'Medium', q: 'Which energy carriers do the light reactions supply to the Calvin cycle?', o: ['ATP and NADPH', 'Glucose and oxygen', 'DNA and RNA', 'FADH2 and pyruvate'], e: 'ATP provides energy and NADPH provides electrons for reducing 3-PGA.' },
  { d: 'Medium', q: 'Why do most leaves look green?', o: ['Chlorophyll reflects green light', 'Chlorophyll absorbs green light best', 'Leaves emit green light', 'Water in leaves is green'], e: 'Chlorophyll absorbs mainly red and blue light, so green is reflected.' },
  { d: 'Medium', q: 'With other factors constant, what happens to the rate as light intensity increases?', o: ['It rises then levels off', 'It keeps rising forever', 'It falls steadily', 'It stays constant'], e: 'Once another factor such as CO2 or enzyme capacity limits the rate, more light has no effect.' },
  { d: 'Medium', q: 'What is the role of NADPH in the Calvin cycle?', o: ['It supplies electrons to reduce 3-PGA to G3P', 'It fixes carbon dioxide', 'It splits water', 'It makes chlorophyll'], e: 'NADPH is the reducing agent that powers the reduction step.' },
  { d: 'Medium', q: 'Which stage directly requires light?', o: ['The light-dependent reactions', 'The Calvin cycle', 'RuBP regeneration', 'Glucose storage'], e: 'The Calvin cycle uses ATP and NADPH but does not directly use light.' },
  { d: 'Hard', q: 'To make one G3P, how many ATP and NADPH does the Calvin cycle consume per 3 CO2 fixed?', o: ['9 ATP and 6 NADPH', '6 ATP and 9 NADPH', '3 ATP and 3 NADPH', '12 ATP and 12 NADPH'], e: 'Fixing 3 CO2 into one G3P costs 9 ATP and 6 NADPH.' },
  { d: 'Hard', q: 'Why does the photosynthesis rate fall at very high temperatures?', o: ['Enzymes such as RuBisCO lose efficiency or denature', 'Chlorophyll turns into glucose', 'Light stops reaching the leaf', 'Water becomes unavailable as a product'], e: 'Heat disrupts enzyme structure, and stomata may also close, limiting CO2.' },
  { d: 'Hard', q: 'In an experiment with labelled oxygen, which molecule supplies the O2 released by a leaf?', o: ['Water', 'Carbon dioxide', 'Glucose', 'ATP'], e: 'Oxygen comes from the splitting of water (photolysis) in the light reactions.' },
  { d: 'Hard', q: 'How does closing stomata on a hot, dry day reduce photosynthetic efficiency?', o: ['Internal CO2 drops and photorespiration rises', 'It raises internal CO2 too much', 'It blocks light from entering', 'It stops chlorophyll production immediately'], e: 'Lower CO2 and higher O2 inside the leaf make RuBisCO more likely to bind O2.' },
  { d: 'Hard', q: 'If thylakoid membranes became leaky to protons, what would be impaired most directly?', o: ['ATP synthesis', 'Carbon fixation by RuBisCO', 'Absorption of light by chlorophyll', 'Water uptake by roots'], e: 'ATP synthase depends on the proton gradient across the thylakoid membrane.' },
  { d: 'Hard', q: 'Which products does cyclic electron flow around photosystem I make?', o: ['ATP only', 'NADPH and O2', 'ATP and NADPH', 'Glucose only'], e: 'Cyclic flow returns electrons to the chain, building a proton gradient without making NADPH or O2.' },
];

const build = (x) => {
  const opts = shuffle(x.o);
  return { question: x.q, options: opts, answer: opts.indexOf(x.o[0]), explanation: x.e, difficulty: x.d };
};

function quiz(count, difficulty) {
  const by = { Easy: shuffle(BANK.filter((x) => x.d === 'Easy')), Medium: shuffle(BANK.filter((x) => x.d === 'Medium')), Hard: shuffle(BANK.filter((x) => x.d === 'Hard')) };
  const picked = [];
  for (let i = 0; i < count; i++) {
    if (difficulty === 'Mixed') {
      const list = by[['Easy', 'Medium', 'Hard'][i % 3]];
      picked.push(list[Math.floor(i / 3) % list.length]);
    } else {
      const list = by[difficulty] || by.Easy;
      picked.push(list[i % list.length]); // repeats if more questions are requested than the demo bank holds
    }
  }
  return { questions: picked.map(build) };
}

module.exports = { summary, quiz };
