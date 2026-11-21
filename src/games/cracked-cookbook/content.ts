// Original prompt packs for Cracked Cookbook. Every item is at most 24 characters,
// so it can double as the default name of the finished prop.

/** Round 1: things that go in the pot. */
export const INGREDIENTS: readonly string[] = [
  'Wobbly meatball', 'Grumpy carrot', 'Sleepy egg', 'Rocket radish', 'Tiny pineapple',
  'Sourdough hat', 'Cheese moon', 'Spaghetti nest', 'Jelly bean boulder', 'Pickle submarine',
  'Mushroom umbrella', 'Lemon lighthouse', 'Butter iceberg', 'Garlic ghost', 'Noodle ladder',
  'Cinnamon log', 'Banana boomerang', 'Pepper volcano', 'Marshmallow cloud', 'Olive marble',
  'Toast raft', 'Waffle window', 'Pancake tower', 'Blueberry button', 'Pretzel knot',
  'Cherry doorbell', 'Soup puddle', 'Honey drip', 'Turnip crown', 'Avocado spaceship',
  'Peanut pebble', 'Sprinkle storm', 'Cabbage brain', 'Fig fossil', 'Maple syrup lake',
  'Cucumber canoe', 'Coconut helmet', 'Tomato balloon', 'Leek sword', 'Bagel lifebuoy',
  'Chili dragon tail', 'Plum pillow', 'Celery bridge', 'Dumpling pouch', 'Basil forest',
  'Rice pebble pile', 'Gravy waterfall', 'Eggplant owl', 'Kiwi eyeball', 'Pear lantern',
  'Walnut castle', 'Biscuit boulder', 'Zucchini zeppelin', 'Crouton cube', 'Jam jar sunrise',
  'Chive grass', 'Taco hammock', 'Sausage snake', 'Radish rosette', 'Mango sunset',
];

/** Round 2: the scenery around the plate. */
export const SCENE_ELEMENTS: readonly string[] = [
  'Candle stub', 'Checkered cloth', 'Tiny flag', 'Wonky fork', 'Spoon boat',
  'Napkin swan', 'Salt shaker tower', 'Floating teacup', 'Paper crown', 'Sunbeam',
  'Rain cloud', 'Flower vase', 'Fairy lights', 'Sleepy cat', 'Hungry ghost',
  'Dragon claw', 'Tiny knight', 'Wizard hat', 'Gold coin', 'Paper lantern',
  'Moth', 'Butterfly', 'Rubber duck', 'Straw hat', 'Chef moustache',
  'Fancy monocle', 'Cupcake flag', 'Ladybug', 'Snail', 'Garden gnome',
  'Pirate flag', 'Party horn', 'Balloon bunch', 'Confetti pile', 'Star sprinkle',
  'Moon slice', 'Tiny volcano', 'Cactus', 'Palm tree', 'Mountain peak',
  'Lily pad', 'Bird feather', 'Treasure key', 'Magic wand', 'Cobweb',
  'Bat wing', 'Snowflake', 'Hot air balloon', 'Mini rainbow', 'Toadstool',
];

export type Meal = 'Breakfast' | 'Lunch' | 'Dessert';

/** Round 3: a meal with a twist. Prompt text is `${meal} ${twist}`. */
export const TWISTS: Record<Meal, readonly string[]> = {
  Breakfast: [
    'for a dragon', 'for a sleepy astronaut', 'on a pirate ship', 'for twelve penguins',
    'in zero gravity', 'for a very small giant', 'served by robots', 'for the grumpiest cat alive',
    'eaten underwater', 'for a knight before a duel', 'during a thunderstorm', 'on top of a mountain',
    'for a ghost who forgot to haunt', 'for a time traveler', 'at a tiny circus', 'for a wizard with no spoon',
  ],
  Lunch: [
    'for a troll under a bridge', 'in a treehouse', 'packed for a snowman', 'for a detective on a stakeout',
    'at the bottom of the sea', 'for a band on tour', 'for a sun-baked cactus', 'for a bored king',
    'on a floating island', 'for an alien visiting Earth', 'for a mermaid picnic', 'inside a giant boot',
    'for a yeti on holiday', 'in a haunted lighthouse', 'at a robot disco', 'for a fox in a hurry',
  ],
  Dessert: [
    'for the queen of the moon', 'that fights back', 'for a sleepy volcano', 'for a birthday on Mars',
    'for a dragon hoard', 'for a very polite monster', 'inside a snow globe', 'for a cloud giant',
    'that glows in the dark', 'for a haunted bakery', 'for a pirate feast', 'for a bear who loves honey',
    'for the last day of summer', 'hidden inside a pie', 'for a snowman wedding', 'for a dinosaur sweet tooth',
  ],
};

/** Every meal prompt as one string, e.g. "Breakfast for a dragon". */
export const MEAL_PROMPTS: readonly string[] = (Object.keys(TWISTS) as Meal[]).flatMap((m) =>
  TWISTS[m].map((t) => `${m} ${t}`),
);
