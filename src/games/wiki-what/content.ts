// Wiki-what question pack: strange-but-real topics, each tied to an English Wikipedia article.
//
// Written in original wording and checked against the named Wikipedia articles and the research
// references noted beside the newest additions.
// OWNER SPOT-CHECK: every row is [article title, question, CORRECT answer, [3 wrong answers], optional fun fact].
// The correct answer is written first so it is easy to review; `QUESTIONS` below places it at a
// deterministic, evenly spread position and gives each question its final {id, choices, answer}.
// Article titles are the titles as best remembered; a few may be redirects. Pure data: no imports.

export interface Question {
  id: string;
  /** English Wikipedia article title the question is drawn from. */
  article: string;
  question: string;
  /** Exactly four distinct choices. */
  choices: string[];
  /** Index of the correct choice. */
  answer: number;
  /** Optional one-line fun fact, shown after the reveal. */
  fact?: string;
}

type Row = [article: string, question: string, correct: string, wrong: [string, string, string], fact?: string];

const ROWS: Row[] = [
  // ---- Wars, feuds and history's odd moments ----
  ['Great Emu War', 'In 1932 the Australian military was sent to deal with which animal?', 'Emus', ['Kangaroos', 'Rabbits', 'Cane toads'], 'The soldiers had machine guns and still mostly lost to the birds.'],
  ['Defenestrations of Prague', 'What happened to two royal governors and a secretary in Prague in 1618, sparking the Thirty Years\' War?', 'They were thrown out of a window', ['They were locked in a tower', 'They were sent down the river on a raft', 'They were stripped of their titles in public'], 'All three survived the fall.'],
  ['Pig War (1859)', 'What was the only casualty of the 1859 Pig War between Britain and the United States?', 'A pig', ['A horse', 'A British sailor', 'A cannon'], 'The standoff over the San Juan Islands lasted years without a single human death.'],
  ['War of Jenkins\' Ear', 'Which body part gave the 1739 British-Spanish conflict its name?', 'An ear', ['A nose', 'A thumb', 'A tongue'], 'Captain Robert Jenkins showed Parliament his severed ear as proof of Spanish brutality.'],
  ['War of the Bucket', 'The 1325 war between Modena and Bologna started over a stolen what?', 'Wooden bucket', ['Church bell', 'Wheel of cheese', 'Ceremonial sword'], 'Modena still keeps the bucket in a tower.'],
  ['Cadaver Synod', 'Who was put on trial in the year 897, months after he had died?', 'A pope', ['A Byzantine emperor', 'A Viking chieftain', 'A saint'], 'The corpse of Pope Formosus was propped up in a chair to hear the charges.'],
  ['Dancing plague of 1518', 'In which city did crowds reportedly dance for days without stopping in 1518?', 'Strasbourg', ['Vienna', 'Prague', 'Florence']],
  ['Tanganyika laughter epidemic', 'What spread from a school to nearby villages in Tanganyika in 1962?', 'Uncontrollable laughter', ['Sneezing fits', 'Fainting spells', 'Hiccups'], 'Schools had to close for months.'],
  ['Toledo War', 'In the 1835 Toledo War, Michigan gave up a border strip to Ohio and got what as a consolation?', 'The Upper Peninsula', ['A slice of Indiana', 'The Lake Erie islands', 'The Niagara region'], 'Almost no blood was spilled, and the stabbing of one sheriff\'s deputy was the worst of it.'],
  ['Emperor Norton', 'In 1859 a San Francisco businessman declared himself Emperor of the United States. What was he known as?', 'Emperor Norton', ['King Barnum', 'Emperor Joshua the Fair', 'Lord Golden Gate'], 'Local shops accepted the banknotes he printed himself.'],
  ['Operation Mincemeat', 'In 1943 British intelligence floated a dead man ashore in Spain carrying what?', 'Forged invasion plans', ['A cursed diamond', 'A hidden radio', 'A real treasure map'], 'The fake plans pointed the Axis away from Sicily, the real target.'],
  ['Project Habakkuk', 'Britain\'s WWII Project Habakkuk planned an aircraft carrier made mostly of what?', 'Reinforced ice', ['Rubber', 'Concrete', 'Cardboard'], 'The ice was mixed with wood pulp to make a tough material called pykrete.'],
  ['Project Pigeon', 'In WWII the psychologist B. F. Skinner trained pigeons to guide what?', 'Missiles', ['Submarines', 'Parachutes', 'Tanks'], 'The birds pecked at a target image on a screen to steer.'],
  ['Bat bomb', 'Which animal did the US military plan to strap tiny incendiary devices to during WWII?', 'Bats', ['Owls', 'Moths', 'Gulls'], 'Escaped test bats reportedly set fire to part of an Army airfield.'],
  ['Acoustic Kitty', 'The CIA once tried to turn which animal into a listening device?', 'A cat', ['A pigeon', 'A rat', 'A parrot'], 'The first outing reportedly ended badly when a taxi came along.'],
  ['Ghost Army', 'The US "Ghost Army" of WWII fooled the enemy with inflatable versions of what?', 'Tanks', ['Soldiers', 'Bridges', 'Ships'], 'Sound trucks played recordings of marching columns too.'],
  ['Great Stink', 'London\'s Great Stink of 1858 pushed the city to build what?', 'A modern sewer system', ['A subway', 'A new bridge', 'A huge reservoir'], 'Engineer Joseph Bazalgette designed the sewers.'],
  ['Great Molasses Flood', 'Which city was hit by a wave of molasses in January 1919?', 'Boston', ['Chicago', 'Baltimore', 'Philadelphia'], 'The cold syrup slowed down rescuers badly.'],
  ['London Beer Flood', 'In 1814 a burst vat flooded a London street with what?', 'Beer', ['Cider', 'Milk', 'Ink'], 'Hundreds of thousands of gallons of porter poured out.'],
  ['Year Without a Summer', 'Which volcano\'s 1815 eruption helped cause the Year Without a Summer?', 'Tambora', ['Krakatoa', 'Vesuvius', 'Mount St. Helens'], 'The gloomy weather helped inspire Mary Shelley to write Frankenstein.'],
  ['Carrington Event', 'The Carrington Event of 1859 was the strongest recorded what?', 'Solar storm', ['Meteor shower', 'Volcanic ash cloud', 'Tsunami'], 'Telegraph operators saw sparks and some could send messages without batteries.'],
  ['Roanoke Colony', 'What single word was found carved into a post at the vanished Roanoke colony in 1590?', 'Croatoan', ['Virginia', 'Raleigh', 'Return'], 'The colonists were never seen again.'],
  ['Oak Island mystery', 'Treasure hunters have dug the Money Pit on Oak Island since the 1790s. In which Canadian province is it?', 'Nova Scotia', ['Newfoundland', 'Quebec', 'New Brunswick']],
  ['D. B. Cooper', 'How much ransom did the hijacker known as D. B. Cooper demand in 1971?', '$200,000', ['$20,000', '$1 million', '$5 million'], 'He parachuted from the plane and was never identified.'],
  ['Hiroo Onoda', 'Japanese soldier Hiroo Onoda kept fighting in a Philippine jungle until 1974. For roughly how long?', '29 years', ['9 years', '14 years', '50 years'], 'He only stood down when his former commander came to tell him to.'],
  ['Ping-pong diplomacy', 'In 1971 table tennis helped thaw relations between the United States and which country?', 'China', ['Soviet Union', 'Cuba', 'Vietnam']],
  ['Football War', 'The 1969 Football War followed World Cup qualifiers between El Salvador and which country?', 'Honduras', ['Guatemala', 'Nicaragua', 'Mexico'], 'The fighting lasted around a hundred hours.'],
  ['Great Moon Hoax', 'In 1835 a New York newspaper claimed astronomers had spotted what on the Moon?', 'Winged humanoids', ['Dragons', 'Whales', 'Cities of glass'], 'Readers loved it, and the paper never really apologised.'],
  ['Vespasian', 'Which Roman emperor put a tax on collecting urine from public toilets?', 'Vespasian', ['Nero', 'Caligula', 'Hadrian'], 'He is said to have answered critics that money does not stink.'],
  ['Incitatus', 'According to ancient historians, Caligula planned to make his horse what?', 'A consul', ['A general', 'A priest', 'A senator\'s heir'], 'The horse reportedly had a marble stable.'],
  ['Animal trial', 'In some medieval European courts, which of these were put on trial?', 'Pigs', ['Rivers', 'Clouds', 'Statues'], 'Some accused animals were even given lawyers.'],
  ['Fred Lorz', 'Why was Fred Lorz stripped of his 1904 Olympic marathon win?', 'He rode in a car for part of the race', ['He ran barefoot', 'He took a shortcut through a tunnel', 'He was a professional'], 'He later said it was a joke that went too far.'],
  ['Art competitions at the Summer Olympics', 'From 1912 to 1948 the Olympics also awarded medals for what?', 'Art', ['Cooking', 'Dancing', 'Chess'], 'Entries came in architecture, literature, music, painting and sculpture.'],
  ['Wojtek (bear)', 'During WWII, Wojtek the bear helped Polish soldiers by doing what?', 'Carrying artillery ammunition', ['Guarding prisoners', 'Delivering mail by plane', 'Sniffing out mines'], 'He was officially enlisted and given a rank.'],
  ['Mechanical Turk', 'The 18th-century chess "automaton" known as the Turk secretly contained what?', 'A human player', ['A trained dog', 'A tiny clockwork brain', 'A hidden radio'], 'It beat many famous opponents before the trick was understood.'],
  ['Vasa (ship)', 'Why did the Swedish warship Vasa sink on her maiden voyage in 1628?', 'She was top-heavy', ['She hit an iceberg', 'Her crew mutinied', 'Her cannons exploded'], 'She was raised in 1961 and is now in a museum.'],
  ['Tsar Bell', 'Moscow\'s Tsar Bell, the largest bell in the world, has never been rung because what happened?', 'A big chunk broke off before it was hung', ['The tower collapsed', 'Nobody could afford a clapper', 'Locals forbade it'], 'It cracked after a fire when water hit the hot metal.'],

  // ---- Hoaxes, forgeries and tricks ----
  ['Cottingley Fairies', 'Which famous author believed photos of the Cottingley Fairies were real?', 'Arthur Conan Doyle', ['H. G. Wells', 'Rudyard Kipling', 'Thomas Hardy'], 'The two girls who took them admitted they were cardboard cut-outs decades later.'],
  ['Piltdown Man', 'The 1912 Piltdown Man hoax paired a human skull with the jaw of which animal?', 'An orangutan', ['A gorilla', 'A wolf', 'A pig'], 'It fooled scientists for about 40 years.'],
  ['Cardiff Giant', 'The Cardiff Giant, unearthed in 1869, was presented as what?', 'A petrified giant man', ['A Viking warrior\'s tomb', 'An alien body', 'A dinosaur skeleton'], 'It was a carved block of gypsum buried by a tobacconist.'],
  ['Fiji mermaid', 'The "Fiji mermaid" shown by P. T. Barnum was made by sewing a monkey\'s upper body to the tail of what?', 'A fish', ['A seal', 'A dolphin', 'A snake']],
  ['Spaghetti-tree hoax', 'Which broadcaster famously showed a family harvesting spaghetti from trees in 1957?', 'The BBC', ['NBC', 'ITV', 'CBC'], 'Hundreds of viewers phoned in to ask how to grow their own.'],
  ['Surgeon\'s Photograph', 'The famous 1934 "Surgeon\'s Photograph" of the Loch Ness Monster was really what?', 'A toy submarine with a sculpted head', ['A swimming otter', 'A floating log', 'A diver in a costume'], 'One of the people involved confessed about 60 years later.'],
  ['Pierre Brassau', 'In 1964 a Swedish "artist" called Pierre Brassau fooled critics. What was he really?', 'A chimpanzee', ['A donkey', 'A teenager', 'A robot'], 'Some critics praised the brushwork.'],
  ['Dihydrogen monoxide hoax', 'A famous joke petition warns against the dangers of "dihydrogen monoxide". What is it?', 'Water', ['Bleach', 'Hydrogen peroxide', 'Laughing gas'], 'People have signed petitions to ban it.'],
  ['Atari video game burial', 'Atari reportedly buried unsold copies of a game in a landfill in which US state?', 'New Mexico', ['Nevada', 'Texas', 'Arizona'], 'The landfill was dug up in 2014 and the carts were there.'],
  ['Fictitious entry', 'Lillian Virginia Mountweazel was a made-up photographer planted in what kind of book?', 'An encyclopedia', ['A cookbook', 'An atlas', 'A phone directory'], 'Fake entries like hers help publishers catch copycats.'],
  ['Trap street', 'Why do mapmakers sometimes add a street that does not exist?', 'To catch people who copy their maps', ['To test GPS devices', 'To confuse tourists', 'To mark a haunted place']],
  ['Sandy Island (New Caledonia)', 'A phantom "Sandy Island" appeared on maps for over a century. What did scientists find there in 2012?', 'Deep open ocean', ['A tiny sandbar', 'A shipwreck', 'A coral reef'], 'It even showed on online maps until it was removed.'],

  // ---- Food and drink ----
  ['Kiviak', 'The Greenlandic dish kiviak is made by fermenting small seabirds called auks inside what?', 'A sealskin', ['A hollow log', 'An ice cave', 'A clay pot'], 'It ferments for months.'],
  ['Hákarl', 'Iceland\'s hákarl is fermented meat from which animal?', 'Greenland shark', ['Great white shark', 'Hammerhead shark', 'Whale shark'], 'The meat is poisonous fresh, so it is fermented and dried first.'],
  ['Casu marzu', 'The Sardinian cheese casu marzu is eaten while it contains live what?', 'Fly larvae', ['Ant eggs', 'Crickets', 'Ladybirds'], 'It is not legal to sell it in many places.'],
  ['Surströmming', 'Surströmming is a famously smelly fermented what from Sweden?', 'Herring', ['Cod', 'Mackerel', 'Sprat jelly'], 'The tins bulge as fermentation continues inside.'],
  ['Century egg', 'Century eggs, a Chinese delicacy, are preserved in a mix of clay, ash, salt and what?', 'Quicklime', ['Honey', 'Vinegar', 'Olive oil'], 'They are not actually a hundred years old: it takes weeks or months.'],
  ['Jaffa Cakes', 'A 1991 UK tax tribunal ruled that Jaffa Cakes are what?', 'Cakes', ['Biscuits', 'Pastries', 'Confectionery'], 'One key argument was that cakes go hard when stale and biscuits go soft.'],
  ['Hawaiian pizza', 'Hawaiian pizza was invented in the 1960s by a Greek-born restaurateur in which country?', 'Canada', ['Italy', 'Australia', 'The United States'], 'It was an experiment with tinned pineapple.'],
  ['Caesar salad', 'In which city was the Caesar salad created?', 'Tijuana', ['Rome', 'Los Angeles', 'Madrid'], 'It is named after restaurateur Caesar Cardini, not an emperor.'],
  ['Miracle fruit', 'After you eat miracle fruit, sour foods taste what?', 'Sweet', ['Bitter', 'Salty', 'Like nothing at all'], 'A protein called miraculin tricks your taste buds.'],
  ['Kopi luwak', 'Kopi luwak coffee beans are collected after passing through which animal?', 'Palm civet', ['Fruit bat', 'Wild boar', 'Mongoose']],
  ['Edible bird\'s nest', 'Edible bird\'s nests used for soup are made mostly of what?', 'Hardened swiftlet saliva', ['Woven grass', 'Fish bones', 'Clay and egg white']],
  ['Gum Wall', 'Which city has a famous alley wall covered with chewed gum?', 'Seattle', ['Portland', 'Boston', 'Vancouver']],
  ['Garum', 'Ancient Romans loved a sauce called garum. What was it made from?', 'Fermented fish', ['Crushed roses', 'Boiled olives', 'Honey and mustard']],

  // ---- Places and phenomena ----
  ['Wow! signal', 'What did astronomer Jerry Ehman write on the printout of a strong 1977 radio signal?', '"Wow!"', ['"Hello?"', '"Again!"', '"Aliens"'], 'The signal lasted 72 seconds and was never heard again.'],
  ['Tunguska event', 'The 1908 Tunguska event flattened about 2,000 square kilometres of forest in which region?', 'Siberia', ['Patagonia', 'Alaska', 'The Outback'], 'No clear crater was ever found.'],
  ['Kentucky meat shower', 'In 1876 what unusual thing fell from the sky over Kentucky?', 'Chunks of meat', ['Frogs', 'Fish', 'Coins']],
  ['Marfa lights', 'The mysterious Marfa lights are seen near a town in which US state?', 'Texas', ['Nevada', 'New Mexico', 'Arizona']],
  ['Hessdalen lights', 'The Hessdalen lights, glowing balls over a valley, are reported in which country?', 'Norway', ['Finland', 'Iceland', 'Canada']],
  ['Sailing stones', 'What was finally shown to move the "sailing stones" across Racetrack Playa in Death Valley?', 'Thin sheets of ice pushed by wind', ['Earthquake tremors', 'Magnetic fields', 'Passing animals'], 'A 2014 time-lapse caught the stones in motion.'],
  ['Blood Falls', 'Why is the water of Antarctica\'s Blood Falls red?', 'Iron in salty water meets air', ['Red algae', 'Volcanic dust', 'Dyed minerals from a mine'], 'Scientists once guessed algae, but it is rust.'],
  ['Darvaza gas crater', 'The burning "Door to Hell" gas crater is in which country?', 'Turkmenistan', ['Kazakhstan', 'Uzbekistan', 'Iran'], 'It has been burning for decades.'],
  ['Lake Hillier', 'What colour is Australia\'s Lake Hillier, even when scooped into a bottle?', 'Pink', ['Neon green', 'Black', 'Orange']],
  ['Socotra', 'The island of Socotra, famous for its umbrella-shaped dragon blood trees, belongs to which country?', 'Yemen', ['Oman', 'Somalia', 'Eritrea'], 'The trees ooze a deep red resin.'],
  ['Giant\'s Causeway', 'Which giant of Irish legend supposedly built the Giant\'s Causeway to reach Scotland?', 'Fionn mac Cumhaill', ['Cú Chulainn', 'Oisín', 'Brian Boru'], 'The real cause is cooling lava that cracked into columns.'],
  ['Spotted Lake', 'Spotted Lake appears dotted in summer in which Canadian province?', 'British Columbia', ['Alberta', 'Ontario', 'Yukon'], 'The spots are mineral deposits that show as the water evaporates.'],
  ['Salar de Uyuni', 'The giant mirror-like salt flat Salar de Uyuni is in which country?', 'Bolivia', ['Chile', 'Peru', 'Argentina'], 'A thin film of rain turns it into a huge mirror.'],
  ['Richat Structure', 'The "Eye of the Sahara", a huge ring seen from space, is in which country?', 'Mauritania', ['Libya', 'Chad', 'Niger']],
  ['Nazca Lines', 'Which animal is among the giant Nazca Lines figures in Peru?', 'Hummingbird', ['Elephant', 'Giraffe', 'Kangaroo'], 'The designs are only clear from high above.'],
  ['Göbekli Tepe', 'The enormous carved stone circles of Göbekli Tepe, older than Stonehenge by thousands of years, are in which country?', 'Turkey', ['Iraq', 'Syria', 'Egypt']],
  ['Sedlec Ossuary', 'Which country is home to the Sedlec Ossuary, a chapel decorated with human bones?', 'Czech Republic', ['Poland', 'Austria', 'Hungary']],
  ['Winchester Mystery House', 'What is odd about the Winchester Mystery House in California?', 'It has staircases that lead nowhere', ['It is built upside down', 'It has no doors', 'It floats on a lake'], 'Construction went on for decades.'],
  ['Dancing House', 'Prague\'s Dancing House is nicknamed after which dancing duo?', 'Fred and Ginger', ['Gene and Debbie', 'Romeo and Juliet', 'Tom and Jerry']],
  ['Kowloon Walled City', 'Kowloon Walled City, once one of the most crowded places on Earth, stood in which city?', 'Hong Kong', ['Macau', 'Singapore', 'Shanghai'], 'It was demolished in the 1990s.'],
  ['Sagrada Família', 'Construction of Barcelona\'s Sagrada Família began in which year?', '1882', ['1782', '1912', '1952'], 'Its architect Gaudí died in 1926, long before it was finished.'],
  ['Palais idéal', 'The French postman Ferdinand Cheval built his Ideal Palace using what?', 'Stones he collected on his mail rounds', ['Bricks from a ruined castle', 'Scrap from a shipyard', 'Sand from the beach'], 'It took him 33 years.'],
  ['Point Nemo', 'The remote Point Nemo in the Pacific is named after a character created by which author?', 'Jules Verne', ['H. G. Wells', 'Mark Twain', 'Herman Melville'], 'Old spacecraft are steered to crash there.'],
  ['Null Island', 'Null Island is a made-up "place" at which coordinates?', '0 degrees latitude, 0 degrees longitude', ['90 degrees north, 0 degrees east', '45 degrees north, 45 degrees east', '0 degrees latitude, 180 degrees longitude'], 'It is a handy dumping spot for map data with a missing location.'],
  ['Four Corners Monument', 'Which of these US states is NOT one of the Four Corners states?', 'Nevada', ['Utah', 'Arizona', 'New Mexico'], 'Four states touch at a single point there.'],
  ['Tristan da Cunha', 'The remote Tristan da Cunha, the most isolated inhabited island group, is in which ocean?', 'South Atlantic', ['Indian', 'Pacific', 'Arctic']],
  ['Lake Baikal', 'Russia\'s Lake Baikal holds about a fifth of the world\'s what?', 'Fresh surface water', ['Salt water', 'Glacier ice', 'Rainfall'], 'It is also the deepest lake on Earth.'],
  ['Bir Tawil', 'Bir Tawil, on the border of Egypt and Sudan, is unusual because it is what?', 'Claimed by neither country', ['Claimed by both countries', 'Entirely underwater', 'Owned by a company'], 'Both countries prefer the other, bigger, disputed area nearby.'],
  ['Baarle-Hertog', 'The border in the town of Baarle is so tangled that it separates enclaves of which two countries?', 'Belgium and the Netherlands', ['France and Spain', 'Germany and Denmark', 'Austria and Switzerland'], 'Some border lines run through houses.'],
  ['Svalbard Global Seed Vault', 'The Svalbard Global Seed Vault stores what?', 'Backup seeds of the world\'s crops', ['Frozen animal embryos', 'Ancient manuscripts', 'Nuclear waste']],
  ['Catatumbo lightning', 'Catatumbo lightning storms strike almost nightly at the mouth of a river in which country?', 'Venezuela', ['Colombia', 'Brazil', 'Ecuador']],
  ['Brinicle', 'A brinicle forms when what happens under sea ice?', 'Very cold salty water sinks and freezes a tube around itself', ['Hot springs melt a hole upward', 'Penguins scratch the ice', 'Meteorites crack the surface'], 'It is sometimes called the "icicle of death".'],
  ['Fata Morgana (mirage)', 'The Fata Morgana mirage is named after which legendary figure?', 'Morgan le Fay', ['Guinevere', 'Merlin', 'Lancelot']],
  ['Petrichor', 'What is the pleasant smell of rain on dry earth called?', 'Petrichor', ['Ozonite', 'Terraline', 'Nimbusine'], 'The word was coined in 1964 by two Australian scientists.'],
  ['Mpemba effect', 'The Mpemba effect is the claim that, in some conditions, what freezes faster than cold water?', 'Hot water', ['Salty water', 'Milk', 'Fizzy water'], 'Scientists still argue about when it really happens.'],

  // ---- Animals ----
  ['Tardigrade', 'Tardigrades have survived tests in which extreme place?', 'The vacuum of space', ['A lava flow', 'The deepest ocean trench boiling', 'A nuclear reactor core'], 'They are nicknamed water bears.'],
  ['Axolotl', 'The axolotl, which can regrow limbs, is native to lakes near which city?', 'Mexico City', ['Lima', 'Bogotá', 'Havana']],
  ['Naked mole-rat', 'Naked mole-rat colonies are ruled by what?', 'A queen', ['A king', 'A council of elders', 'The oldest male']],
  ['Blobfish', 'Why does a blobfish look droopy and sad at the surface?', 'Its body is built for deep-sea pressure', ['It dislikes sunlight', 'It is always that shape', 'It is out of water too long and sunburnt'], 'Underwater it looks like a fairly normal fish.'],
  ['Sea cucumber', 'When threatened, some sea cucumbers push what out of their bodies?', 'Their internal organs', ['Ink', 'Electricity', 'Poisonous spines'], 'They can grow them back.'],
  ['Pistol shrimp', 'A pistol shrimp snaps its claw to make what?', 'A bubble that collapses with a flash of light', ['A jet of poison', 'An electric shock', 'A cloud of ink'], 'The pop is among the loudest sounds in the sea.'],
  ['Mantis shrimp', 'A mantis shrimp\'s punch is strong enough to do what?', 'Crack aquarium glass', ['Stun a whale', 'Cut through rope', 'Lift a stone']],
  ['Wombat', 'What shape are wombat droppings?', 'Cubes', ['Spheres', 'Triangles', 'Spirals'], 'The cubes do not roll away when stacked as markers.'],
  ['Hippopotamus', 'Hippos ooze a red-orange fluid that works like what?', 'Sunscreen', ['Glue', 'Perfume', 'Camouflage paint'], 'It is nicknamed blood sweat but it is not blood.'],
  ['Turritopsis dohrnii', 'When stressed, the "immortal jellyfish" can do what?', 'Revert to an earlier life stage', ['Split into two adults', 'Grow a second bell', 'Turn invisible']],
  ['Kākāpō', 'What kind of bird is New Zealand\'s kākāpō?', 'A flightless, nocturnal parrot', ['A tiny flightless penguin', 'A night heron', 'A giant pigeon'], 'It is the heaviest parrot in the world.'],
  ['Platypus', 'The platypus belongs to which group of egg-laying mammals?', 'Monotremes', ['Marsupials', 'Rodents', 'Reptiles'], 'Males have a venomous spur on each hind leg.'],
  ['Cassowary', 'A cassowary\'s head carries a helmet-like crest called what?', 'A casque', ['A plume', 'A comb', 'A crown'], 'It also has a dagger-like claw on each foot.'],
  ['Shoebill', 'The shoebill\'s scientific name, Balaeniceps, points to which sea animal?', 'A whale', ['A walrus', 'A shark', 'A seal'], 'It is a huge swamp bird with a clog-shaped beak.'],
  ['Okapi', 'The okapi, with its striped legs, is the closest living relative of which animal?', 'The giraffe', ['The zebra', 'The horse', 'The tapir']],
  ['Pangolin', 'Pangolins are the only mammals covered in large what?', 'Keratin scales', ['Quills', 'Feathers', 'Horns'], 'Their scales are made of the same stuff as your fingernails.'],
  ['Sloth', 'Roughly once a week, a sloth climbs down from its tree to do what?', 'Go to the toilet', ['Hunt', 'Drink from a stream', 'Sleep']],
  ['Narwhal', 'What is a narwhal\'s long spiral "tusk"?', 'A tooth', ['A horn', 'A fused whisker', 'A bone spike'], 'Medieval merchants sold them as unicorn horns.'],
  ['Lyrebird', 'Which bird is famous for imitating camera shutters and chainsaws?', 'Lyrebird', ['Peacock', 'Flamingo', 'Heron']],
  ['Bowerbird', 'Male bowerbirds build and decorate what to impress mates?', 'A stage of sticks hung with colourful objects', ['A deep burrow filled with seeds', 'A floating nest', 'A tower of mud']],
  ['Hoatzin', 'The South American hoatzin is nicknamed the "stinkbird" because it smells like what?', 'Manure', ['Rotten eggs', 'Wet dog', 'Smoke'], 'Its chicks have little claws on their wings.'],
  ['Nils Olav', 'A king penguin named Nils Olav was knighted by which country\'s King\'s Guard?', 'Norway', ['United Kingdom', 'Denmark', 'Sweden'], 'He lives at Edinburgh Zoo.'],
  ['Cymothoa exigua', 'The parasite Cymothoa exigua replaces which part of a fish?', 'Its tongue', ['Its eye', 'Its fin', 'Its gills']],
  ['Mimic octopus', 'The mimic octopus can imitate which venomous animal?', 'A lionfish', ['A whale', 'A kingfisher', 'A squirrel']],
  ['Greenland shark', 'A Greenland shark may live for roughly how long?', 'About 400 years', ['About 80 years', 'About 150 years', 'About 1,200 years'], 'It is thought to be the longest-lived vertebrate.'],
  ['Ming (clam)', 'Ming, a clam found off Iceland in 2006, was about how old?', '507 years', ['57 years', '120 years', '2,000 years']],
  ['Wood frog', 'How does the wood frog survive freezing winters?', 'It freezes solid and thaws in spring', ['It buries itself in lava vents', 'It migrates south in flocks', 'It lives inside beaver dams']],
  ['Coelacanth', 'The coelacanth, thought to have gone extinct with the dinosaurs, was found alive in 1938 off which country?', 'South Africa', ['Chile', 'Japan', 'Iceland']],
  ['Periodical cicadas', 'Some North American cicadas emerge on a cycle of how many years?', '17', ['7', '10', '25'], 'They pop up in huge numbers, then vanish for years.'],
  ['Bombardier beetle', 'Bombardier beetles defend themselves by spraying what?', 'A near-boiling chemical mix', ['Sticky silk', 'Glowing dust', 'Cold mist']],
  ['Dung beetle', 'Dung beetles can steer a straight line at night using what in the sky?', 'The Milky Way', ['The Moon\'s craters', 'Wind direction', 'Satellites']],
  ['Ophiocordyceps unilateralis', 'The "zombie-ant fungus" makes infected ants clamp their jaws onto what?', 'A plant leaf or stem', ['Another ant', 'A rock', 'A feather']],
  ['Winnie-the-Pooh', 'Winnie-the-Pooh was named after a real bear linked to which Canadian city?', 'Winnipeg', ['Calgary', 'Vancouver', 'Halifax']],
  ['Hachikō', 'Hachikō, the famously loyal dog, waited for his owner at which Tokyo station?', 'Shibuya', ['Ueno', 'Shinjuku', 'Ikebukuro']],
  ['Fainting goat', 'What actually happens when a "fainting goat" is startled?', 'Its muscles stiffen and lock', ['It loses consciousness', 'It screams and runs', 'It freezes its breath']],
  ['Lord Byron', 'Because Cambridge banned dogs, the poet Lord Byron kept which pet instead?', 'A bear', ['A monkey', 'A fox', 'A falcon']],

  // ---- Plants ----
  ['Pando (tree)', 'Pando, a candidate for the heaviest organism on Earth, is what?', 'A colony of aspen trees sharing one root system', ['A giant mushroom', 'A coral reef', 'A bamboo forest'], 'It stands in Utah.'],
  ['Rafflesia arnoldii', 'The giant flower Rafflesia arnoldii smells like what?', 'Rotting meat', ['Vanilla', 'Fresh bread', 'Lemons'], 'The smell attracts flies that pollinate it.'],
  ['Venus flytrap', 'A Venus flytrap shuts only after its trigger hairs are touched how many times in quick succession?', 'Twice', ['Once', 'Five times', 'Ten times'], 'That stops it wasting energy on raindrops.'],
  ['Welwitschia', 'How many leaves does a Welwitschia, a Namib desert plant, grow in its whole life?', 'Two', ['One', 'Twelve', 'Hundreds'], 'They keep growing and fray into ribbons.'],
  ['Wollemia', 'The Wollemi pine, once known only from fossils, was found alive in 1994 in which country?', 'Australia', ['Chile', 'New Zealand', 'Canada']],

  // ---- Language, words and wordplay ----
  ['Ghoti', 'The joke spelling "ghoti" is meant to be read as which word?', 'Fish', ['Ghost', 'Goat', 'Photo'], 'It uses gh from "enough", o from "women" and ti from "nation".'],
  ['Buffalo buffalo Buffalo buffalo buffalo buffalo Buffalo buffalo', 'In the sentence "Buffalo buffalo Buffalo buffalo buffalo buffalo Buffalo buffalo", "buffalo" works as a city name, an animal and what?', 'A verb', ['A colour', 'A number', 'A greeting'], 'The sentence is grammatical, if you squint.'],
  ['Interrobang', 'The interrobang is a punctuation mark that combines which two marks?', 'Question mark and exclamation mark', ['Comma and full stop', 'Colon and dash', 'Hyphen and quotation mark']],
  ['Octothorpe', 'Which symbol is sometimes called an octothorpe?', 'The hash sign', ['The ampersand', 'The asterisk', 'The at sign']],
  ['Gadsby (novel)', 'Ernest Vincent Wright\'s 1939 novel Gadsby, about 50,000 words long, never uses which letter?', 'E', ['A', 'T', 'S']],
  ['Toki Pona', 'Toki Pona is a constructed language built on about how many words?', 'About 120', ['About 12', 'About 1,200', 'About 12,000']],
  ['Silbo Gomero', 'Silbo Gomero, a whistled language of the Canary Islands, is a whistled form of which language?', 'Spanish', ['Portuguese', 'Arabic', 'Basque']],
  ['Mondegreen', 'What is a mondegreen?', 'A mishearing of words in a song or poem', ['A made-up word for a colour', 'A rhyme with no meaning', 'A word spelled the same backwards'], 'The word came from a misheard line about "Lady Mondegreen".'],
  ['Llanfairpwllgwyngyll', 'The long Welsh village name Llanfairpwllgwyngyll...gogogoch has how many letters?', '58', ['28', '41', '77'], 'The long form was invented in the 1800s to attract visitors.'],
  ['Rongorongo', 'The undeciphered rongorongo script comes from which island?', 'Easter Island', ['Crete', 'Iceland', 'Hawaii']],
  ['Phaistos Disc', 'The mysterious Phaistos Disc, covered in stamped symbols, was found on which island?', 'Crete', ['Cyprus', 'Sicily', 'Malta']],
  ['Voynich manuscript', 'What makes the Voynich manuscript famous?', 'Nobody can read its writing', ['It is written in invisible ink', 'It is made of gold leaf', 'It is hidden in a vault nobody can open'], 'It is kept at Yale and has strange plant drawings.'],
  ['Kryptos', 'The sculpture Kryptos, with a famous partly unsolved code, stands at the grounds of which organisation?', 'The CIA', ['NASA', 'The Smithsonian', 'The Library of Congress']],
  ['Quipu', 'The Inca kept records using what?', 'Knotted cords called quipu', ['Painted tiles', 'Carved gourds', 'Woven maps']],
  ['Rosetta Stone', 'The Rosetta Stone carries one decree written in how many scripts?', 'Three', ['Two', 'Four', 'Five'], 'It helped scholars decipher Egyptian hieroglyphs.'],
  ['Vomitorium', 'In ancient Roman theatres, what was a vomitorium?', 'A passage that let crowds exit quickly', ['A room for feasts', 'A spa bath', 'An orchestra pit'], 'The "room to throw up" idea is a myth.'],

  // ---- Science, maths and thought experiments ----
  ['Pareidolia', 'Seeing faces in clouds or toast is called what?', 'Pareidolia', ['Synesthesia', 'Hypnagogia', 'Déjà vu']],
  ['McGurk effect', 'In the McGurk effect, watching a speaker\'s mouth changes what?', 'What sound you hear', ['What colour you see', 'How hot something feels', 'How fast time seems to go']],
  ['Barnum effect', 'The Barnum effect is the tendency to accept what as personally true?', 'Vague descriptions, like horoscopes', ['Compliments from strangers', 'Warnings from friends', 'Statistics about yourself']],
  ['Streisand effect', 'The Streisand effect was named after her 2003 attempt to suppress a photo of what?', 'Her house', ['Her dog', 'Her tour bus', 'Her Oscar']],
  ['Stendhal syndrome', 'Stendhal syndrome is a rush of dizziness triggered by exposure to what?', 'Beautiful art', ['Loud music', 'Strong perfume', 'Crowds'], 'It was named after a famous visit to Florence.'],
  ['Phineas Gage', 'What passed through Phineas Gage\'s head in 1848 and left him alive?', 'An iron rod', ['A railroad spike', 'A drill bit', 'A pickaxe']],
  ['Hiccup', 'Charles Osborne reportedly hiccuped without stopping for about how long?', '68 years', ['8 years', '18 years', '31 years'], 'They stopped on their own the year before he died.'],
  ['Pitch drop experiment', 'The Pitch drop experiment, begun in 1927, measures the dripping of what?', 'Tar-like pitch', ['Honey', 'Mercury', 'Molasses'], 'Drops fall roughly once in a decade.'],
  ['Centennial Light', 'The Centennial Light, a light bulb in Livermore, California, has been burning since which year?', '1901', ['1881', '1921', '1951']],
  ['Dyson sphere', 'A Dyson sphere is a hypothetical structure built around what?', 'A star', ['A black hole', 'A planet\'s core', 'A comet']],
  ['Moon tree', 'Seeds carried around the Moon on which Apollo mission later grew into "Moon trees"?', 'Apollo 14', ['Apollo 8', 'Apollo 11', 'Apollo 17']],
  ['Voyager Golden Record', 'The Golden Record on the Voyager probes includes greetings in how many human languages?', '55', ['12', '29', '100']],
  ['Pale Blue Dot', 'The Pale Blue Dot photo of Earth was taken by which spacecraft?', 'Voyager 1', ['Cassini', 'Pioneer 10', 'Galileo'], 'Earth is less than a single pixel in it.'],
  ['ʻOumuamua', 'The name of the interstellar visitor ʻOumuamua comes from which language?', 'Hawaiian', ['Māori', 'Samoan', 'Navajo'], 'It roughly means a scout or messenger from afar.'],
  ['Bloop', 'What most likely made the ultra-loud 1997 underwater sound called the Bloop?', 'Cracking ice', ['A giant squid', 'A submarine', 'An undersea volcano']],
  ['Birthday problem', 'In a room of how many people is there about a 50 percent chance two share a birthday?', '23', ['100', '183', '57'], 'Pairs add up faster than most people expect.'],
  ['Hilbert\'s paradox of the Grand Hotel', 'In a hotel with infinitely many rooms, all full, how can a new guest get a room?', 'Move every guest from room n to room n+1', ['Ask one guest to share', 'Build a new floor on top', 'Evict the guest in room 1']],
  ['Four color theorem', 'The 1976 proof of the four color theorem was famous for using what?', 'A computer', ['A giant paper map', 'A secret formula from a rival', 'A game show']],
  ['Coastline paradox', 'The coastline paradox says a coastline\'s measured length depends on what?', 'The size of the ruler used', ['The weather', 'The tide only', 'The colour of the map']],
  ['Möbius strip', 'A Möbius strip has how many sides?', 'One', ['Two', 'Three', 'Four']],
  ['Googol', 'A googol is a 1 followed by how many zeros?', '100', ['10', '1,000', '1,000,000'], 'The name was suggested by a child.'],
  ['Spherical cow', 'Physicists joke about a "spherical cow" to poke fun at what?', 'Over-simplified models', ['Farm science', 'Round tables in meetings', 'Laboratory animals']],
  ['Benford\'s law', 'Benford\'s law says that in many real data sets the first digit is most often which?', '1', ['5', '7', '9'], 'Auditors use it to spot made-up numbers.'],
  ['Fermat\'s Last Theorem', 'Who finally proved Fermat\'s Last Theorem in the 1990s?', 'Andrew Wiles', ['Kurt Gödel', 'Alan Turing', 'Paul Erdős'], 'Fermat said the margin of his book was too small for his proof.'],
  ['Unix time', 'Unix time counts the seconds since which date?', '1 January 1970', ['1 January 1900', '1 January 1980', '1 January 2000']],
  ['Software bug', 'What was famously taped into a 1947 logbook as the "first actual case of bug being found"?', 'A moth', ['A beetle', 'A fly', 'A spider']],
  ['Numbers station', 'Numbers stations are shortwave radio broadcasts of what?', 'Strings of spoken numbers', ['Random poetry', 'Weather forecasts in code', 'Old advertisements']],
  ['UVB-76', 'The Russian radio station UVB-76 is known for broadcasting mostly what?', 'A repetitive buzzing tone', ['Opera', 'Weather reports', 'Birdsong']],
  ['Arecibo message', 'The 1974 Arecibo message was beamed toward a star cluster in which constellation?', 'Hercules', ['Orion', 'Lyra', 'Cygnus'], 'It will take about 25,000 years to arrive.'],
  ['Antikythera mechanism', 'What did the ancient Greek Antikythera mechanism calculate?', 'Positions of the Sun and Moon and eclipses', ['Grain prices', 'Ship speed', 'River tides']],
  ['Lycurgus Cup', 'The Roman Lycurgus Cup changes colour depending on the light because it contains tiny particles of what?', 'Gold and silver', ['Copper and tin', 'Mercury', 'Amber']],
  ['Ship of Theseus', 'The Ship of Theseus puzzle asks whether a ship is still the same after you replace all its what?', 'Planks', ['Sails', 'Names', 'Crew']],
  ['Diogenes', 'To mock Plato\'s definition of man as a "featherless biped", Diogenes presented what?', 'A plucked chicken', ['A shaved monkey', 'A baby', 'A statue']],
  ['Tycho Brahe', 'The astronomer Tycho Brahe lost part of his nose in a duel over what?', 'A mathematical formula', ['A horse race', 'A card game', 'An inheritance'], 'He reportedly wore a metal replacement nose and kept a pet elk.'],
  ['Marie Curie', 'Why are Marie Curie\'s notebooks still kept in lead-lined boxes?', 'They are radioactive', ['They are made of gold', 'They are cursed', 'They are written in code']],
  ['Clock of the Long Now', 'The Clock of the Long Now in Texas is built to keep ticking for how many years?', '10,000', ['1,000', '100,000', '500']],

  // ---- Culture, music, art ----
  ['Ig Nobel Prize', 'The Ig Nobel Prizes honour research that first makes people do what?', 'Laugh, then think', ['Gasp', 'Argue', 'Nap']],
  ['Wilhelm scream', 'The Wilhelm scream is a famous stock what?', 'Sound effect', ['Dance move', 'Camera shot', 'Typeface'], 'It has been reused in films since the 1950s.'],
  ['Chindōgu', 'Chindōgu is the Japanese art of making what?', 'Almost-useless inventions', ['Tiny paper boats', 'Poetic tea sets', 'Hidden gardens']],
  ['Rubber duck debugging', 'Rubber duck debugging means fixing code by explaining it to what?', 'A rubber duck', ['A mirror', 'A houseplant', 'A rubber stamp']],
  ['Rickrolling', 'Rickrolling is a bait-and-switch prank that plays which song?', '"Never Gonna Give You Up"', ['"Together Forever"', '"Take On Me"', '"Never Gonna Dance"']],
  ['Theremin', 'How do you play a theremin?', 'By moving your hands near it without touching', ['By blowing across holes', 'By plucking wet strings', 'By turning a crank']],
  ['Glass harmonica', 'Which Founding Father invented the glass armonica?', 'Benjamin Franklin', ['Thomas Jefferson', 'Alexander Hamilton', 'Thomas Paine']],
  ['Great Stalacpipe Organ', 'The Great Stalacpipe Organ in Virginia makes music by tapping what?', 'Stalactites', ['Seashells', 'Glass jars', 'Tree trunks']],
  ['4′33″', 'John Cage\'s 4′33″ asks the performer to play what?', 'Nothing', ['A single note', 'Wind chimes', 'A birdsong recording'], 'The sounds of the room become the music.'],
  ['Vexations', 'Erik Satie\'s piece "Vexations" asks for a short theme to be played how many times?', '840', ['12', '100', '4,000']],
  ['As Slow as Possible', 'John Cage\'s "As Slow as Possible" is being played in a German church over how many years?', '639', ['64', '100', '1,000'], 'It began in 2001, and a note change is a public event.'],
  ['Girl with Balloon', 'What happened to Banksy\'s "Girl with Balloon" just after it sold at auction in 2018?', 'It was partly shredded', ['It was set on fire', 'It was stolen', 'It was painted over']],
  ['Fountain (Duchamp)', 'Marcel Duchamp\'s "Fountain" was a signed what?', 'Urinal', ['Bicycle wheel', 'Bottle rack', 'Shovel'], 'He signed it "R. Mutt".'],
  ['Comedian (artwork)', 'Maurizio Cattelan\'s artwork "Comedian" was a banana attached to a wall with what?', 'Duct tape', ['Super glue', 'Nails', 'A paper clip']],
  ['Dogs Playing Poker', 'The Dogs Playing Poker paintings were created to help advertise what?', 'Cigars', ['Dog food', 'Casinos', 'Playing cards']],
  ['Bliss (image)', 'The Windows XP wallpaper "Bliss" is a photograph of a hillside in which US state?', 'California', ['Oregon', 'Vermont', 'Texas']],
  ['Strandbeest', 'What powers Theo Jansen\'s walking Strandbeest sculptures?', 'Wind', ['Solar panels', 'Tides', 'Steam']],
  ['Konami Code', 'Which button presses start the famous Konami Code?', 'Up, up, down, down', ['Left, left, right, right', 'A, B, A, B', 'Start, select, start']],
  ['Toki Pona', 'Toki Pona\'s creator designed it to do what?', 'Simplify thinking with very few words', ['Imitate birdsong', 'Replace Latin', 'Be spoken backwards']],

  // ---- Sport and festivals ----
  ['Cooper\'s Hill Cheese-Rolling and Wake', 'At Cooper\'s Hill in England, competitors chase a rolling what down a steep slope?', 'Round of cheese', ['Barrel of cider', 'Wicker ball', 'Pumpkin'], 'The winner takes home the cheese.'],
  ['Wife-carrying', 'Wife-carrying races began in which country?', 'Finland', ['Sweden', 'Latvia', 'Iceland'], 'The prize is traditionally the wife\'s weight in beer.'],
  ['Toe wrestling', 'In which country are the World Toe Wrestling Championships held?', 'England', ['Wales', 'Ireland', 'Scotland']],
  ['Bog snorkelling', 'Bog snorkelling world championships take place in which country?', 'Wales', ['Ireland', 'Scotland', 'England'], 'Swimmers race through a trench cut into a peat bog.'],
  ['La Tomatina', 'La Tomatina, a giant street food fight, is held in which Spanish town?', 'Buñol', ['Pamplona', 'Seville', 'Toledo']],
  ['Up Helly Aa', 'Shetland\'s Up Helly Aa fire festival ends with the burning of a what?', 'Viking longship', ['Giant straw goat', 'Wooden castle', 'Stack of old boats']],
  ['Krampus', 'In Alpine folklore, the horned Krampus accompanies which figure at Christmastime?', 'Saint Nicholas', ['Odin', 'Mother Holle', 'Baba Yaga']],
  ['Mari Lwyd', 'The Welsh winter tradition of the Mari Lwyd features a what?', 'Horse skull on a pole', ['Giant straw goat', 'Cardboard dragon', 'Pumpkin lantern'], 'Visitors and householders trade rhymes in a verse battle.'],
  ['Buzkashi', 'In the Central Asian sport of buzkashi, riders compete for what?', 'A goat carcass', ['A leather ball', 'A silver cup', 'A live chicken']],
  ['Sepak takraw', 'Sepak takraw is like volleyball, but players cannot use their what?', 'Hands', ['Heads', 'Feet', 'Elbows'], 'The ball is woven from rattan.'],
  ['Tug of war', 'Tug of war was an official Olympic sport until which year?', '1920', ['1936', '1948', '1960']],

  // ---- Obscure science, accidents and legal history ----
  // Research: IET Archives (https://ietarchivesblog.org/2015/08/12/perpetual-motion-in-the-iet-archives/)
  // and Physics Education (https://doi.org/10.1088/0143-0807/5/4/001).
  ['Oxford Electric Bell', 'What has powered the Oxford Electric Bell through its almost continuous ringing since 1840?', 'A pair of dry piles', ['A hand-cranked generator', 'A weight-driven clockwork', 'A steam engine'], 'The bell is still going, but it is kept behind glass because its tiny ring is too quiet to hear.'],
  // Research: University of Louisiana at Lafayette Special Collections (https://library.louisiana.edu/news-events/news/20221118/fun-fact-friday-special-collections).
  ['Lake Peigneur', 'What did an oil-drilling rig accidentally break through beneath Lake Peigneur in 1980?', 'The roof of a salt mine', ['A lava tube', 'A water pipeline', 'A natural gas cavern'], 'The lake drained into the mine, while barges, a tugboat and the drilling rig were pulled into the sinkhole.'],
  // Research: the original field study (https://doi.org/10.1371/journal.pone.0105948).
  ['Sailing stones', 'At Death Valley’s Racetrack Playa, what helps move the rocks that leave long trails in the mud?', 'Thin ice panels pushed by light wind', ['Underground geysers', 'Dust devils lifting them', 'Seasonal floods rolling them downhill'], 'Researchers recorded more than 60 rocks moving during one event in December 2013.'],
  // Research: MacGregor, Open Library of Humanities (https://doi.org/10.16995/olh.319).
  ['Animal trial', 'In a documented 1457 trial in Savigny, which animal was accused of killing a child?', 'A sow', ['A bull', 'A dog', 'A horse'], 'The surviving account describes a formal hearing with a lawyer, prosecutors and named witnesses.'],
  // Research: U.S. National Park Service (https://home.nps.gov/articles/aps-v11-i1-c2.htm).
  ['Novarupta', 'What landscape did Alaska’s 1912 Novarupta eruption create?', 'The Valley of Ten Thousand Smokes', ['The Valley of the Moon', 'The Petrified Forest', 'The Great Blue Hole'], 'It was the largest volcanic eruption of the twentieth century.'],
  // Research: Yang et al., Soft Matter (https://doi.org/10.1039/D0SM01230K).
  ['Wombat feces', 'What unusual shape do wombat droppings have?', 'Cubes', ['Pyramids', 'Rings', 'Perfect spheres'], 'Researchers found that parts of the wombat intestine differ greatly in stiffness, helping form the corners.'],
  // Research: Minnesota Department of Natural Resources (https://www.dnr.state.mn.us/mcvmagazine/issues/2017/mar-apr/devils-kettle-mystery.html).
  ["Devil's Kettle", 'At Minnesota’s Devil’s Kettle waterfall, where did hydrologists find the water that seemed to vanish?', 'Back in the river below the falls', ['In Lake Superior through a lava tube', 'In a hidden underground lake', 'Inside the rock as groundwater'], 'They compared water flow above and below the falls and found no mysterious loss.'],
  // Research: USDA Forest Service, Malheur National Forest (https://www.fs.usda.gov/sites/nfs/files/r06/malheur/publication/Humongus%20Fungus.pdf).
  ['Armillaria ostoyae', 'The “Humongous Fungus” in Oregon is one connected individual of what?', 'A honey fungus', ['A puffball mushroom', 'A shelf fungus', 'A truffle'], 'Its underground network covers about 2,385 acres in Malheur National Forest.'],
  // Research: USDA Forest Service General Technical Report (https://www.fs.usda.gov/rm/pubs/rmrs_gtr202.pdf).
  ['Pando (tree)', 'Pando in Utah looks like a forest of aspens. What is it genetically?', 'One quaking aspen clone', ['A grove planted from imported seeds', 'A stand of several related species', 'A fossilized forest'], 'Its many trunks grow from a shared root system.'],
  // ---- New researched questions ----
  // Research: Smithsonian Institution (https://insider.si.edu/2012/01/five-funky-and-5-fun-fish-facts/)
  ['Hagfish', 'How does a hagfish defend itself when grabbed by a predator?', 'It releases a huge amount of slime', ['It sprays ink that hardens', 'It sheds its skin', 'It inflates like a balloon'], 'A single hagfish can produce enough slime to fill a bucket in minutes.'],
  // Research: American Museum of Natural History (https://www.amnh.org/explore/ology/ology-cards/131-aye-aye)
  ['Aye-aye', 'What does an aye-aye use its extra-long middle finger to do?', 'Tap wood and pull out insect grubs', ['Dig underground roots', 'Comb its fur', 'Catch fish in streams'], 'It also uses the finger to scoop food from coconuts.'],
  // Research: Smithsonian National Zoo (https://nationalzoo.si.edu/animals/hellbender)
  ['Hellbender', 'How does the hellbender salamander get most of its oxygen?', 'Through folds of skin along its sides', ['Through gills on its head', 'By swallowing air bubbles', 'Through its tail fin'], 'Its lungs are present but mostly nonfunctional.'],
  // Research: Smithsonian National Zoo (https://nationalzoo.si.edu/animals/alligator-snapping-turtle)
  ['Alligator snapping turtle', 'What does an alligator snapping turtle use as a fishing lure?', 'A wormlike appendage on its tongue', ['A glowing patch on its shell', 'A vibrating claw', 'A trail of bubbles'], 'It can wait almost motionless with its mouth open.'],
  // Research: Smithsonian Institution (https://insider.si.edu/2012/01/five-funky-and-5-fun-fish-facts/)
  ['Four-eyed fish', 'Why does the four-eyed fish have eyes divided into upper and lower parts?', 'To see above and below the water at once', ['To see behind itself', 'To see in total darkness', 'To spot ultraviolet colors'], 'It swims with its eyes at the waterline.'],
  // Research: Smithsonian Institution (https://insider.si.edu/2012/01/five-funky-and-5-fun-fish-facts/)
  ['African lungfish', 'What can an African lungfish do when its pool dries up?', 'Bury itself in mud and wait for rain', ['Turn into a cocoon of ice', 'Climb trees to find water', 'Breathe through its fins'], 'It can survive buried in a mud chamber for years.'],
  // Research: Monterey Bay Aquarium (https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/leafy-sea-dragon)
  ['Leafy sea dragon', 'Where does a male leafy sea dragon carry fertilized eggs?', 'On a patch on the underside of its tail', ['In a pouch on its belly', 'Inside its mouth', 'In a nest of seaweed'], 'Unlike seahorses, sea dragons do not have a brood pouch.'],
  // Research: PubMed, Current Biology (https://pubmed.ncbi.nlm.nih.gov/27485308/)
  ['Great frigatebird', 'What unusual thing have scientists recorded great frigatebirds doing while flying?', 'Sleeping for brief periods', ['Drinking seawater through their feathers', 'Changing color to avoid storms', 'Hibernating in the clouds'], 'They can sleep with one brain hemisphere at a time.'],
  // Research: Smithsonian Ocean (https://ocean.si.edu/ocean-life/fish/spin-hagfish-slime-silk)
  // Research: Smithsonian (https://www.si.edu/Content/SE/Educator%20Guides/secret_ocean_educators_guide.pdf)
  ['Octopus', 'How many hearts does an octopus have?', 'Three', ['One', 'Two', 'Five'], 'Two pump blood to the gills; another serves the rest of the body.'],
  // Research: Arnold Arboretum, Harvard University (https://arboretum.harvard.edu/frequently-asked-questions-about-the-titan-arum-or-corpse-flower/)
  ['Amorphophallus titanum', 'Why does the titan arum produce a smell like rotting flesh?', 'To attract carrion-feeding pollinators', ['To repel hungry monkeys', 'To cool its underground tuber', 'To warn neighboring plants'], 'The flowering structure can also generate heat.'],
  // Research: USDA Agricultural Research Service (https://www.ars.usda.gov/news-events/news/research-news/2020/fungus-commits-floral-fraud-to-fool-insects-into-spreading-it/)
  ['Fusarium xyrophilum', 'How does the fungus Fusarium xyrophilum help spread its spores?', 'It makes fake flowers that attract insects', ['It launches spores with tiny springs', 'It hitchhikes inside raindrops', 'It glows to attract bats'], 'The fungus can sterilize the host plant’s real flowers.'],
  // Research: University of Alaska Fairbanks (https://www.uaf.edu/news/archives/news-archives-2010-2021/alaska-frogs.php)
  ['Wood frog', 'What helps an Alaskan wood frog survive freezing during winter?', 'A burst of glucose that protects its cells', ['Antifreeze made from salt water', 'A shell that traps warm air', 'A layer of frozen sap'], 'Some remain frozen for months before thawing in spring.'],
  // Research: PubMed (https://pubmed.ncbi.nlm.nih.gov/23352694/)
  ['Scarabaeus satyrus', 'What celestial feature can a ball-rolling dung beetle use to keep a straight course at night?', 'The Milky Way', ['The North Star only', 'The Moon’s shadow', 'The color of Mars'], 'It is one of the few animals known to orient by starlight.'],
  // Research: Smithsonian Institution (https://www.si.edu/collections/snapshot/behold-mantis-shrimp)
  ['Mantis shrimp', 'What happens in the water around a mantis shrimp when it strikes very quickly?', 'Cavitation bubbles form and collapse', ['The water freezes instantly', 'A miniature whirlpool lasts for hours', 'The water becomes magnetic'], 'The collapsing bubbles add a second burst of force.'],
  // Research: Rutgers University (https://www.rutgers.edu/news/solar-powered-sea-slugs-shed-light-search-perpetual-green-energy)
  ['Elysia chlorotica', 'How can the sea slug Elysia chlorotica keep using sunlight after eating algae?', 'It retains some of the algae’s chloroplasts', ['It grows leaves along its back', 'It has solar crystals in its shell', 'It farms glowing bacteria'], 'The stolen chloroplasts can keep photosynthesizing inside the slug.'],
  // Research: Smithsonian Institution (https://www.si.edu/Content/SE/Educator%20Guides/secret_ocean_educators_guide.pdf)
  ['Sea cucumber', 'What can some sea cucumbers expel through their rear end when threatened?', 'Sticky internal organs', ['A cloud of eggshells', 'A jet of hot water', 'Their entire skeleton'], 'They can later regenerate the lost organs.'],
  // Research: UNESCO (https://whc.unesco.org/en/list/1267/)
  ['Surtsey', 'Why are visits to Iceland’s Surtsey island tightly restricted?', 'To let scientists study natural colonization with little human disturbance', ['To protect a hidden medieval city', 'Because the island is privately owned', 'To keep its volcano from erupting'], 'The island rose from the sea during eruptions in the 1960s.'],
  // Research: USGS (https://www.usgs.gov/media/images/exploding-lakes-cameroon)
  ['Lake Nyos', 'What gas built up in deep water before Lake Nyos released a deadly cloud in 1986?', 'Carbon dioxide', ['Methane', 'Chlorine', 'Hydrogen'], 'Engineers later used a pipe to vent gas from the lake bottom.'],
  // Research: NASA history (https://www.nasa.gov/wp-content/uploads/static/history/alsj/HamishALSEP.html)
  ['Apollo 12', 'After Apollo 12 deliberately crashed its lunar module into the Moon, how long did vibrations last?', 'Nearly an hour', ['About five seconds', 'A full day', 'Several weeks'], 'The vibrations were recorded by a seismometer left on the surface.'],
  // Research: NASA (https://www.nasa.gov/history/55-years-ago-apollo-12-makes-a-pinpoint-landing-on-the-moon/)
  ['John Aaron', 'During the Apollo 12 launch emergency, what did flight controller John Aaron tell the crew to switch to?', 'The SCE auxiliary setting', ['The lunar landing radar', 'The backup oxygen tank', 'The manual docking mode'], 'The uncommon switch setting restored useful system readings.'],
  // Research: OECD conference proceedings (https://www.oecd.org/content/dam/oecd/en/publications/reports/2015/12/radioactive-waste-management-and-constructing-memory-for-future-generations_g1g626d2/9789264249868-en.pdf)
  ['Inland Customs Line', 'What was the Great Hedge of India built to help enforce?', 'A colonial salt tax', ['A ban on tea imports', 'A railway toll', 'A border quarantine'], 'The thorn barrier was eventually abandoned in 1879.'],
  // Research: National Railway Museum (https://blog.railwaymuseum.org.uk/trains-for-the-dead-curiosities-from-the-engineering-drawing-collection/)
  ['London Necropolis Railway', 'Where did the London Necropolis Railway carry the dead for burial?', 'Brookwood Cemetery', ['Highgate Cemetery', 'Stonehenge', 'The Isle of Wight'], 'The cemetery was roughly 25 miles from London.'],
  // Research: National Museum of Customs & GST (https://nacin.gov.in/Documents/e-Books/Vadodara/Dharohar%20Catalogue%20Final_07th%20June%202022.pdf)
  ['Great Hedge of India', 'What was the main barrier material in the Great Hedge of India?', 'Living thorny shrubs', ['Brick arches', 'Iron railings', 'A line of canals'], 'It formed part of a customs barrier used to control salt smuggling.'],
  // Research: HISTORY (https://www.history.com/articles/dodecahedron-ancient-rome-puzzle)
  ['Roman dodecahedron', 'What remains uncertain about the hollow, twelve-sided Roman dodecahedrons?', 'What they were used for', ['Which metal they were made from', 'Who discovered the first one', 'Whether they were hollow'], 'Many have been found in former Roman territories in northern Europe.'],
  // Research: HISTORY (https://www.history.com/articles/8-famous-time-capsules)
  ['Century Safe', 'Who assembled the 1876 Century Safe, an early planned time capsule?', 'Anna Deihm', ['Susan B. Anthony', 'Harriet Tubman', 'Mary Cassatt'], 'It was opened during the United States bicentennial in 1976.'],
  // Research: HISTORY (https://www.history.com/articles/7-historical-hoaxes)
  ['Drake’s Plate of Brass', 'What was the supposed historical artifact later exposed as a modern practical joke?', 'A brass plate attributed to Francis Drake', ['A gold compass from Columbus', 'A Roman map of California', 'A Viking sword from Alaska'], 'Researchers identified the plate as a fake in 1977.'],
  // Research: Smithsonian (https://americanhistory.si.edu/explore/topics/invention-and-innovation)
  ['Magnavox Odyssey', 'What was the “Brown Box” prototype developed by Ralph Baer and colleagues?', 'A multiplayer video game system', ['A portable cassette player', 'A home computer mouse', 'A television remote'], 'Magnavox licensed it and released the Odyssey in 1972.'],
  // Research: Science History Institute (https://www.sciencehistory.org/stories/magazine/when-electricity-met-democratic-revolution/)
  ['Leyden jar', 'What did the early Leyden jar store?', 'Electric charge', ['Compressed air', 'Magnetic iron filings', 'Radio waves'], 'Its inventor reportedly described the shock as making his whole body quiver.'],
  // Research: Science History Institute (https://www.sciencehistory.org/education/scientific-biographies/william-henry-perkin/)
  ['Mauveine', 'What was William Perkin trying to make when he accidentally discovered the dye mauveine?', 'Quinine', ['A new kind of glass', 'Rubber', 'Soap'], 'The discovery helped launch the synthetic dye industry.'],
  // Research: NASA (https://www.nasa.gov/wp-content/uploads/static/history/SP-4029/Apollo_12a_Summary.htm)
  ['Apollo 12 launch', 'What struck Apollo 12 shortly after liftoff in 1969?', 'Lightning', ['A meteorite', 'A bird', 'A micrometeorite shower'], 'The crew restored power and continued toward the Moon.'],
  // Research: USGS (https://pubs.usgs.gov/of/1987/0097/report.pdf)
  ['Lake Nyos disaster', 'What made the gas cloud from Lake Nyos especially dangerous as it moved downhill?', 'It was dense carbon dioxide that displaced oxygen', ['It was boiling steam', 'It carried radioactive ash', 'It was a fast-moving lava flow'], 'The release was not caused by a volcanic eruption.'],
  // Research: Natural History Museum, London (https://www.nhm.ac.uk/discover/animals-named-after-mythological-creatures.html)
  ['Dracula ant', 'How does a Dracula ant deliver its remarkably fast jaw strike?', 'It snaps its jaws together like a spring', ['It fires a venomous hair', 'It headbutts with a horn', 'It whips its abdomen'], 'The strike helps it hunt centipedes.'],
  // Research: HISTORY (https://www.history.com/articles/the-cardiff-giant-fools-the-nation-145-years-ago)
  ['Calaveras Skull', 'What was the Calaveras Skull falsely claimed to show?', 'Ancient humans in North America millions of years ago', ['A new dinosaur species', 'A lost Roman colony', 'The first modern surgical operation'], 'Local men later said they had planted it as a joke.'],
  // Research: HISTORY (https://www.history.com/articles/7-historical-treasures-discovered-by-accident)
  ['Lascaux Cave', 'What first led four teenagers to discover the Lascaux Cave paintings?', 'Their dog investigated a hole', ['A lightning strike opened a passage', 'A road crew exposed a mural', 'A farmer followed a fox'], 'The cave contains thousands of prehistoric images.'],
  // Research: HISTORY (https://www.history.com/articles/7-historical-treasures-discovered-by-accident)
  ['Derinkuyu', 'How was the underground city of Derinkuyu rediscovered in 1963?', 'Someone knocked down a wall while renovating a home', ['A well collapsed during a storm', 'A shepherd found a hidden door', 'A railway tunnel broke through it'], 'The city has multiple levels carved into rock.'],
  // Research: HISTORY (https://www.history.com/articles/when-did-humans-first-discover-dinosaurs)
  ['Robert Plot', 'What did Robert Plot suggest a large fossil bone might belong to in 1677?', 'A giant', ['A dragonfly', 'A sea serpent', 'A Roman horse'], 'It is now recognized as a dinosaur bone.'],
  // Research: HISTORY (https://www.history.com/articles/8-famous-time-capsules)
  ['Crypt of Civilization', 'What was the Crypt of Civilization designed to preserve for future people?', 'A broad record of human life and knowledge', ['Only a collection of coins', 'A royal burial chamber', 'A message to Mars'], 'It was sealed in 1940 and scheduled to open in 8113.'],
  // Research: National Railway Museum (https://blog.railwaymuseum.org.uk/trains-for-the-dead-curiosities-from-the-engineering-drawing-collection/)
  ['Brookwood Cemetery', 'Why was Brookwood Cemetery established outside London?', 'London needed more burial space', ['A royal family moved there', 'It was built around a monastery', 'It was a quarantine station'], 'A dedicated railway once brought funeral parties there.'],
  // Research: Smithsonian Institution (https://ocean.si.edu/ocean-life/invertebrates/octopuses-squids-and-relatives)
  ['Cephalopod', 'Which group of sea animals is known for having three hearts?', 'Cephalopods', ['Sea stars', 'Crustaceans', 'Corals'], 'The group includes octopuses, squid and cuttlefish.'],
  // Research: Natural History Museum, London (https://www.nhm.ac.uk/discover/animals-named-after-mythological-creatures.html)
  ['Goblin shark', 'What is unusual about a goblin shark’s mouth when it catches prey?', 'It can extend forward from the head', ['It opens on top of its head', 'It has no teeth', 'It detaches and grows back'], 'Its skin can look pink because it is translucent.'],
  // Research: Smithsonian National Zoo (https://nationalzoo.si.edu/animals/news/7-spooktacular-animal-facts-halloween)
  ['California sea lion', 'Why can an older California sea lion’s teeth look black?', 'A protective coating of bacteria', ['They are stained by squid ink', 'Their enamel turns to iron', 'They eat volcanic rock'], 'The dark color is not necessarily a sign of tooth decay.'],
  // Research: Smithsonian Institution (https://insider.si.edu/2012/01/five-funky-and-5-fun-fish-facts/)
  ['Anemonefish', 'What can happen to the largest male anemonefish if the group’s female dies?', 'He can change sex and become female', ['He grows into a different species', 'He leaves the reef permanently', 'He stops eating and becomes dormant'], 'The next-largest fish can then become the breeding male.'],
  // Research: Monterey Bay Aquarium (https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/leafy-sea-dragon)
  ['Leafy sea dragon eggs', 'About how long do leafy sea dragon eggs develop on the male’s tail?', 'About four weeks', ['One day', 'Six months', 'Two years'], 'The newborns are on their own after hatching.'],
  // Research: NASA (https://www.nasa.gov/history/55-years-ago-apollo-12-makes-a-pinpoint-landing-on-the-moon/)
  ['Surveyor 3', 'What did Apollo 12 astronauts retrieve from the Surveyor 3 probe on the Moon?', 'Parts of the robotic spacecraft', ['A soil sample from Mars', 'A camera from Apollo 11', 'A lunar meteorite'], 'Apollo 12 landed within a few hundred feet of the probe.'],
  // Research: OECD conference proceedings (https://www.oecd.org/content/dam/oecd/en/publications/reports/2015/12/radioactive-waste-management-and-constructing-memory-for-future-generations_g1g626d2/9789264249868-en.pdf)
  ['Inland Customs Line', 'In which year was the Indian Inland Customs Line abandoned?', '1879', ['1823', '1857', '1919'], 'The tax was thereafter collected at salt production sites.'],
  // Research: UNESCO (https://whc.unesco.org/en/list/1267/)
  ['Surtsey research', 'What did scientists observe arriving on Surtsey after the island formed?', 'Seeds and other life colonizing new land', ['A permanent freshwater river', 'A population of large mammals', 'A forest carried by ice'], 'It is protected so these ecological changes can be observed.'],
  // Research: USGS (https://www.usgs.gov/media/images/exploding-lakes-cameroon)
  ['Lake Nyos degassing', 'How does the degassing pipe at Lake Nyos bring deep water to the surface?', 'Dissolved gas drives the water upward', ['A diesel pump lifts it', 'A tidal current pulls it', 'A solar heater boils it'], 'The fountain can rise high without a pump.'],
  // Research: Smithsonian Ocean (https://ocean.si.edu/ocean-life/fish/spin-hagfish-slime-silk)
  // Research: NASA history (https://www.nasa.gov/wp-content/uploads/static/history/alsj/HamishALSEP.html)
  ['Lunar seismology', 'What was the Apollo 12 lunar module ascent stage used to help calibrate?', 'A seismometer left on the Moon', ['A telescope on Earth', 'A solar panel in orbit', 'A radio antenna on Mars'], 'Its controlled impact produced a long-lasting seismic signal.'],
  // Research: HISTORY (https://www.history.com/articles/7-historical-treasures-discovered-by-accident)
  ['Venus de Milo', 'What is still uncertain about the Venus de Milo statue?', 'What its missing arms once held', ['Which island it was found on', 'Whether it is marble', 'The name of its sculptor'], 'A farmer found it on the Greek island of Milos.'],
  // Research: Smithsonian National Zoo (https://nationalzoo.si.edu/animals/hellbender)
  ['Hellbender respiration', 'About how much of its oxygen can a hellbender absorb through its skin?', 'Up to 95 percent', ['About 5 percent', 'About 25 percent', 'Exactly half'], 'The folds along its sides provide much of the breathing surface.'],
  // Research: NASA (https://www.nasa.gov/wp-content/uploads/static/history/SP-4029/Apollo_12a_Summary.htm)
];

/** Deterministic, evenly spread slot for the correct answer, so positions carry no pattern. */
function slot(i: number): number {
  return (Math.imul(i + 1, 2654435761) >>> 28) % 4;
}

export const QUESTIONS: readonly Question[] = ROWS.map(([article, question, correct, wrong, fact], i) => {
  const answer = slot(i);
  const choices = wrong.slice();
  choices.splice(answer, 0, correct);
  const q: Question = { id: `ww-${String(i + 1).padStart(3, '0')}`, article, question, choices, answer };
  if (fact) q.fact = fact;
  return q;
});
