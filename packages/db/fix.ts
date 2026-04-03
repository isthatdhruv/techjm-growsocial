import { db, userModelConfig } from './src/index';

async function run() {
  console.log('Fixing model configs...');
  const configs = await db.query.userModelConfig.findMany();
  for (const c of configs) {
    let changed = false;
    let newSlotA = c.slotAModel;
    let newSlotB = c.slotBModel;
    let newSlotC = c.slotCModel;
    let newSlotD = c.slotDModel;
    let newSubAgent = c.subAgentModel;
    let newCaption = c.captionModel;

    const fixName = (m) => {
      if (!m) return m;
      if (m.includes('gemini-3.1')) return 'gemini-1.5-pro';
      if (m.includes('gemini-2.5-flash')) return 'gemini-1.5-flash';
      if (m.includes('gpt-5')) return 'gpt-4o';
      if (m.includes('claude-haiku-4-5')) return 'claude-3-5-haiku-latest';
      if (m.includes('mistral-medium')) return 'mistral-large-latest';
      return m;
    };

    newSlotA = fixName(newSlotA);
    newSlotB = fixName(newSlotB);
    newSlotC = fixName(newSlotC);
    newSlotD = fixName(newSlotD);
    newSubAgent = fixName(newSubAgent);
    newCaption = fixName(newCaption);

    if (
      newSlotA !== c.slotAModel ||
      newSlotB !== c.slotBModel ||
      newSlotC !== c.slotCModel ||
      newSlotD !== c.slotDModel ||
      newSubAgent !== c.subAgentModel ||
      newCaption !== c.captionModel
    ) {
      // Drizzle update query
      await db.update(userModelConfig).set({
        slotAModel: newSlotA,
        slotBModel: newSlotB,
        slotCModel: newSlotC,
        slotDModel: newSlotD,
        subAgentModel: newSubAgent,
        captionModel: newCaption,
      });
      changed = true;
    }
  }
  console.log('Fixed DB successfully');
  process.exit(0);
}

run().catch(console.error);
