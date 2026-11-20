// Forgery prompt pack: original categories of everyday, drawable things.
// Rules the content test enforces: >= 30 categories, >= 8 words each, words are lowercase
// letters/spaces of at least 4 letters, and no word is hidden inside its category title.
export interface Category {
  title: string;
  words: string[];
}

export const CATEGORIES: Category[] = [
  { title: 'Kitchen tools', words: ['whisk', 'ladle', 'spatula', 'rolling pin', 'colander', 'teapot', 'toaster', 'grater', 'frying pan', 'corkscrew'] },
  { title: 'On the farm', words: ['chicken', 'piglet', 'donkey', 'goose', 'turkey', 'sheep', 'rooster', 'tractor', 'scarecrow', 'haystack'] },
  { title: 'Under the sea', words: ['octopus', 'jellyfish', 'seahorse', 'starfish', 'lobster', 'dolphin', 'turtle', 'walrus', 'anchor', 'shipwreck'] },
  { title: 'Fruit bowl', words: ['banana', 'pineapple', 'cherry', 'grapes', 'lemon', 'mango', 'melon', 'peach', 'strawberry', 'coconut'] },
  { title: 'Vegetable patch', words: ['carrot', 'broccoli', 'pumpkin', 'onion', 'pepper', 'cabbage', 'tomato', 'potato', 'mushroom', 'cucumber'] },
  { title: 'Weather', words: ['rainbow', 'lightning', 'snowman', 'tornado', 'umbrella', 'icicle', 'puddle', 'sunshine', 'hailstorm', 'windsock'] },
  { title: 'Ways to travel', words: ['bicycle', 'submarine', 'helicopter', 'scooter', 'canoe', 'sailboat', 'skateboard', 'hot air balloon', 'cable car', 'ferry'] },
  { title: 'Playground', words: ['swing set', 'seesaw', 'sandbox', 'monkey bars', 'hopscotch', 'jump rope', 'tire swing', 'climbing frame', 'roundabout', 'slide'] },
  { title: 'Bedroom', words: ['pillow', 'blanket', 'wardrobe', 'alarm clock', 'bunk bed', 'slippers', 'nightstand', 'teddy bear', 'mirror', 'dressing gown'] },
  { title: 'Bathroom', words: ['toothbrush', 'bathtub', 'shower', 'towel', 'rubber duck', 'plunger', 'razor', 'sponge', 'bubble bath', 'laundry basket'] },
  { title: 'Garden shed', words: ['wheelbarrow', 'sprinkler', 'flowerpot', 'watering can', 'hedge', 'shovel', 'beehive', 'garden gnome', 'lawnmower', 'garden hose'] },
  { title: 'Birthday party', words: ['balloon', 'candles', 'pinata', 'party hat', 'confetti', 'gift box', 'streamers', 'cupcake', 'sparkler', 'party horn'] },
  { title: 'Band practice', words: ['guitar', 'trumpet', 'drum kit', 'piano', 'violin', 'microphone', 'saxophone', 'tambourine', 'harp', 'xylophone'] },
  { title: 'Sports kit', words: ['tennis racket', 'football', 'helmet', 'hockey stick', 'goal net', 'bowling pin', 'dumbbell', 'boxing glove', 'whistle', 'surfboard'] },
  { title: 'Campsite', words: ['campfire', 'sleeping bag', 'lantern', 'marshmallow', 'compass', 'canteen', 'binoculars', 'hiking boots', 'tent', 'fishing rod'] },
  { title: 'Jobs', words: ['firefighter', 'astronaut', 'scientist', 'farmer', 'pilot', 'clown', 'lifeguard', 'plumber', 'detective', 'magician'] },
  { title: 'Fairy tale', words: ['castle', 'dragon', 'unicorn', 'magic wand', 'crown', 'beanstalk', 'treasure chest', 'knight', 'wizard hat', 'spell book'] },
  { title: 'Outer space', words: ['planet', 'comet', 'telescope', 'satellite', 'moon rover', 'alien', 'black hole', 'space station', 'meteor', 'galaxy'] },
  { title: 'Long ago', words: ['tyrannosaurus', 'triceratops', 'stegosaurus', 'pterodactyl', 'fossil', 'mammoth', 'volcano', 'caveman', 'dinosaur egg', 'sabre tooth'] },
  { title: 'Toolbox', words: ['hammer', 'screwdriver', 'wrench', 'ladder', 'tape measure', 'handsaw', 'pliers', 'paint roller', 'spirit level', 'chisel'] },
  { title: 'Breakfast', words: ['pancakes', 'waffle', 'cereal bowl', 'fried egg', 'toast', 'bacon', 'croissant', 'orange juice', 'porridge', 'yogurt'] },
  { title: 'Sweet treats', words: ['ice cream', 'doughnut', 'cheesecake', 'milkshake', 'popsicle', 'brownie', 'apple pie', 'lollipop', 'pudding', 'candy cane'] },
  { title: 'Takeaway', words: ['hamburger', 'hot dog', 'pizza slice', 'french fries', 'taco', 'burrito', 'sushi', 'popcorn', 'pretzel', 'sandwich'] },
  { title: 'Pets', words: ['puppy', 'kitten', 'hamster', 'goldfish', 'parrot', 'rabbit', 'tortoise', 'guinea pig', 'canary', 'fish tank'] },
  { title: 'At the zoo', words: ['giraffe', 'elephant', 'penguin', 'kangaroo', 'crocodile', 'zebra', 'hippo', 'gorilla', 'flamingo', 'panda'] },
  { title: 'Creepy crawlies', words: ['butterfly', 'ladybug', 'spider', 'caterpillar', 'dragonfly', 'snail', 'beetle', 'grasshopper', 'firefly', 'honeybee'] },
  { title: 'School day', words: ['pencil case', 'blackboard', 'scissors', 'ruler', 'globe', 'glue stick', 'notebook', 'sharpener', 'lunchbox', 'school bus'] },
  { title: 'Wardrobe', words: ['raincoat', 'sneakers', 'mittens', 'scarf', 'top hat', 'sunglasses', 'overalls', 'bow tie', 'pyjamas', 'cowboy hat'] },
  { title: 'Around town', words: ['library', 'lighthouse', 'skyscraper', 'bakery', 'bus stop', 'fire station', 'post box', 'drawbridge', 'fountain', 'windmill'] },
  { title: 'Festive season', words: ['christmas tree', 'fireworks', 'easter egg', 'snow globe', 'stocking', 'sleigh', 'jack o lantern', 'advent calendar', 'wreath', 'snowflake'] },
  { title: 'Monsters', words: ['ghost', 'vampire', 'werewolf', 'zombie', 'mummy', 'skeleton', 'yeti', 'goblin', 'witch', 'haunted house'] },
  { title: 'Gadgets', words: ['television', 'headphones', 'laptop', 'camera', 'remote control', 'game controller', 'mobile phone', 'light bulb', 'radio', 'smartwatch'] },
  { title: 'Seaside', words: ['sandcastle', 'beach ball', 'deckchair', 'sunscreen', 'seashell', 'flip flops', 'bodyboard', 'lifebuoy', 'parasol', 'bucket and spade'] },
  { title: 'Toy box', words: ['rocking horse', 'kite', 'jigsaw', 'building blocks', 'spinning top', 'toy train', 'rubber ball', 'doll house', 'marbles', 'board game'] },
  { title: 'Living room', words: ['sofa', 'bookshelf', 'armchair', 'dining table', 'chandelier', 'curtains', 'rocking chair', 'fridge', 'fireplace', 'staircase'] },
];
