export const ABILITIES = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
] as const;

export type Ability = (typeof ABILITIES)[number];
export type CharacterStats = Record<Ability, number>;

export type FourD6Roll = {
  dice: number[];
  dropped: number;
  score: number;
};

export type AssignedScore = FourD6Roll & {
  ability: Ability;
  finalScore: number;
};

export function roll4d6DropLowest(random: () => number = Math.random): FourD6Roll {
  const dice = Array.from({ length: 4 }, () => Math.floor(random() * 6) + 1).sort((a, b) => a - b);
  return {
    dice,
    dropped: dice[0],
    score: dice[1] + dice[2] + dice[3],
  };
}

export function assignAndAdjustScores(priority: Ability[], rolls: FourD6Roll[]) {
  if (
    priority.length !== ABILITIES.length ||
    new Set(priority).size !== ABILITIES.length ||
    ABILITIES.some((ability) => !priority.includes(ability))
  ) {
    throw new Error("Choose each of the six abilities exactly once.");
  }
  if (
    rolls.length !== ABILITIES.length ||
    rolls.some((roll) => roll.score < 3 || roll.score > 18 || !Number.isInteger(roll.score))
  ) {
    throw new Error("Six valid 4d6-drop-lowest rolls are required.");
  }

  const sortedRolls = [...rolls].sort((a, b) => b.score - a.score);
  const stats: CharacterStats = {
    strength: 0,
    dexterity: 0,
    constitution: 0,
    intelligence: 0,
    wisdom: 0,
    charisma: 0,
  };
  priority.forEach((ability, index) => {
    stats[ability] = sortedRolls[index].score;
  });

  const initialTotal = ABILITIES.reduce((sum, ability) => sum + stats[ability], 0);
  let total = initialTotal;

  while (total > 72) {
    const highest = Math.max(...ABILITIES.map((ability) => stats[ability]));
    const ability = [...priority].reverse().find((item) => stats[item] === highest);
    if (!ability) throw new Error("Could not adjust the highest ability score.");
    stats[ability] -= 1;
    total -= 1;
  }

  while (total < 72) {
    const lowest = Math.min(...ABILITIES.map((ability) => stats[ability]));
    const ability = priority.find((item) => stats[item] === lowest && stats[item] < 17);
    if (!ability) throw new Error("Could not adjust the lowest ability score to 72.");
    stats[ability] += 1;
    total += 1;
  }

  return {
    stats,
    initialTotal,
    assigned: priority.map((ability, index) => ({
      ...sortedRolls[index],
      ability,
      finalScore: stats[ability],
    })),
  };
}
