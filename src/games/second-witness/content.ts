// Second Witness prompt pack. Original text, written for this game.
// Each entry is the prompt, then (optionally) 3-6 sample answers the bots draw from.
// Samples are only listed where the answer is a plain fact of Latter-day Saint culture or
// scripture; opinion prompts get a few common, plausible answers.
// Duplicates in the owner's notes were merged (see the "Merged" comment at the end).

export interface Prompt {
  id: string;
  text: string;
  /** Bot answers (3-6), or empty for prompts the bots answer from a generic pool. */
  samples: string[];
}

const RAW: [string, ...string[]][] = [
  // Scripture and doctrine
  ['Books in the Book of Mormon', '1 Nephi', 'Alma', 'Mosiah', 'Ether', 'Moroni'],
  ['Books in the New Testament', 'Matthew', 'John', 'Acts', 'Romans', 'Revelation'],
  ['Books in the Old Testament', 'Genesis', 'Exodus', 'Psalms', 'Isaiah', 'Daniel'],
  ['People in the Book of Mormon', 'Nephi', 'Lehi', 'Alma', 'Moroni', 'Abinadi', 'Samuel the Lamanite'],
  ['Villains in the scriptures', 'Satan', 'Laman', 'Korihor', 'Goliath', 'Cain', 'Pharaoh'],
  ['Famous women in the scriptures', 'Eve', 'Sarah', 'Mary', 'Ruth', 'Esther', 'Sariah'],
  ['Famous people in the scriptures', 'Moses', 'Noah', 'Abraham', 'David', 'Nephi'],
  ['Famous scriptures', 'John 3:16', 'Moroni 10:4', '1 Nephi 3:7', 'James 1:5', 'Mosiah 2:17'],
  ['Common scriptural phrases', 'And it came to pass', 'Verily, verily', 'Behold', 'Thus saith the Lord', 'Hearken'],
  ['Miracles in the scriptures', 'Parting the Red Sea', 'Feeding the five thousand', 'Raising Lazarus', 'Water into wine', "Daniel in the lions' den"],
  ['Scriptural artifacts', 'Liahona', 'Urim and Thummim', 'Golden plates', 'Sword of Laban', 'Brass plates', 'Ark of the Covenant'],
  ['Animals mentioned in the scriptures', 'Lamb', 'Serpent', 'Lion', 'Donkey', 'Dove', 'Sheep'],
  ['Animals on Noah’s ark', 'Giraffe', 'Elephant', 'Lion', 'Dove', 'Zebra'],
  ['Plants in the Garden of Eden', 'Tree of life', 'Tree of knowledge', 'Fruit trees', 'Grass', 'Flowers'],
  ['Plagues from the scriptures', 'Frogs', 'Locusts', 'Darkness', 'Hail', 'Boils', 'Blood'],
  ['Prophets that start with M', 'Moses', 'Mormon', 'Moroni', 'Malachi', 'Micah'],
  ['People in a nativity scene', 'Mary', 'Joseph', 'Baby Jesus', 'Shepherds', 'Wise men'],
  ['Parts of the plan of salvation', 'Premortal life', 'Mortal life', 'Spirit world', 'Resurrection', 'Judgment', 'Celestial kingdom'],
  ['Spiritual gifts', 'Faith', 'Healing', 'Discernment', 'Prophecy', 'Wisdom', 'Tongues'],
  ['Gospel principles', 'Faith', 'Repentance', 'Baptism', 'Gift of the Holy Ghost'],
  ['Signs of the Second Coming', 'Wars and rumors of wars', 'Earthquakes', 'Famines', 'Moon turned to blood', 'Gospel preached to all nations'],
  ['Teachings that start with S', 'Service', 'Sabbath day', 'Sacrament', 'Salvation', 'Scripture study'],
  ['Teachings that start with C', 'Charity', 'Covenants', 'Commandments', 'Consecration'],
  ['Teachings that start with T', 'Tithing', 'Testimony', 'Temples', 'Truth', 'Trust in the Lord'],
  ['Commandments', 'Keep the Sabbath day holy', 'Do not steal', 'Do not kill', 'Honor your father and mother', 'Pay tithing', 'Love one another'],
  ['Hard gospel words to pronounce', 'Zarahemla', 'Melchizedek', 'Mahershalalhashbaz', 'Zeezrom', 'Nephihah'],
  ['Word of Wisdom prohibitions', 'Coffee', 'Tea', 'Alcohol', 'Tobacco', 'Vaping'],
  ['Classic teachings of our prophets'],
  ['Latter-day prophets', 'Joseph Smith', 'Brigham Young', 'Gordon B. Hinckley', 'Thomas S. Monson', 'Spencer W. Kimball', 'Russell M. Nelson'],
  ['Living apostles'],
  ['Church martyrs', 'Joseph Smith', 'Hyrum Smith', 'Abinadi', 'Stephen'],

  // Church history and places
  ['Famous women in church history', 'Emma Smith', 'Eliza R. Snow', 'Emmeline B. Wells', 'Mary Fielding Smith', 'Lucy Mack Smith'],
  ['Church history sites', 'Sacred Grove', 'Kirtland Temple', 'Nauvoo', 'Carthage Jail', 'Liberty Jail', 'Hill Cumorah'],
  ['Historic church buildings', 'Salt Lake Temple', 'Salt Lake Tabernacle', 'Kirtland Temple', 'Nauvoo Temple', 'Manti Temple', 'Assembly Hall'],
  ['Early church settlements that were abandoned', 'Far West', 'Adam-ondi-Ahman', 'Winter Quarters', 'Nauvoo', 'Kirtland'],
  ['Something a pioneer brought with them', 'Scriptures', 'Quilt', 'Cast iron skillet', 'Seeds', 'Clothing'],
  ['Something a pioneer would wear', 'Bonnet', 'Long dress', 'Apron', 'Boots', 'Suspenders', 'Hat'],
  ['Temples in Utah Valley', 'Provo Utah Temple', 'Provo City Center Temple', 'Mount Timpanogos Temple', 'Payson Utah Temple', 'Orem Utah Temple'],
  ['Future temple sites'],
  ['Places where there’s lots of members', 'Utah', 'Idaho', 'Provo', 'Salt Lake City', 'Rexburg', 'Mesa'],
  ['Cities in Utah', 'Provo', 'Orem', 'Salt Lake City', 'St. George', 'Ogden', 'Logan'],
  ['Celebrity church members', 'Donny Osmond', 'Marie Osmond', 'Steve Young', 'Brandon Flowers', 'Stephenie Meyer', 'Brandon Sanderson'],

  // Missions
  ['Places you can go on a mission'],
  ['Most common stateside missions'],
  ['Most common foreign missions'],
  ['Languages you might learn on a mission', 'Spanish', 'Portuguese', 'Tagalog', 'French', 'Korean', 'Japanese'],
  ['Missions where you’ll learn French', 'France', 'Haiti', 'Quebec', 'Ivory Coast', 'Switzerland'],
  ['What a missionary wears', 'Name tag', 'White shirt', 'Tie', 'Suit', 'Dress shoes'],
  ['Things in a missionary’s bag', 'Scriptures', 'Name tag', 'Umbrella', 'Water bottle', 'Planner', 'Pamphlets'],
  ['Things in a missionary’s suitcase', 'White shirts', 'Suits', 'Ties', 'Dress shoes', 'Scriptures', 'Socks'],
  ['Topics you might write to a missionary about', 'Family news', 'Ward news', 'Sports', 'Weather', 'Testimony', 'Funny stories'],
  ['Events you might miss on your mission', 'Weddings', 'Births', 'Funerals', 'Holidays', 'Graduations', 'Birthdays'],
  ['Top things to do after a mission', 'Go back to school', 'Get married', 'Get a job', 'Date', 'Sleep in'],
  ['Things newly returned missionaries do'],

  // Callings and wards
  ['Callings', 'Primary teacher', 'Nursery leader', 'Ward clerk', 'Bishop', 'Relief Society president', 'Elders quorum president'],
  ['Hardest callings', 'Nursery leader', 'Primary president', 'Bishop', 'Relief Society president', 'Executive secretary'],
  ['Church employment jobs'],
  ['Service assignments for elders quorum', 'Helping people move', 'Yard work', 'Shoveling snow', 'Setting up chairs', 'Fixing things'],
  ['Families in the ward'],
  ['Meetings you have at church', 'Sacrament meeting', 'Sunday School', 'Relief Society', 'Elders quorum', 'Primary', 'Ward council'],
  ['Ward activities', 'Trunk-or-treat', 'Ward campout', 'Ward Christmas party', 'Linger longer', 'Pioneer Day'],
  ['Ways to serve in the ward'],
  ['Ways to serve in your home'],
  ['Places you volunteer', 'Food bank', 'School', 'Hospital', 'Animal shelter', 'Library'],
  ['Acts of service', 'Mow a lawn', 'Bring a meal', 'Shovel snow', 'Babysit', 'Give a ride', 'Write a note'],
  ['Ways to minister', 'Visit', 'Bring a meal', 'Send a text', 'Give a ride', 'Write a note', 'Babysit'],
  ['Ways to worship', 'Pray', 'Sing hymns', 'Attend church', 'Go to the temple', 'Read scriptures', 'Take the sacrament'],
  ['Things tithing is used for', 'Temples', 'Meetinghouses', 'Missionary work', 'Scripture translation', 'Family history'],
  ['Ways to help new converts', 'Invite them to dinner', 'Be a friend', 'Give them a calling', 'Sit with them at church', 'Answer questions'],
  ['Ways people hear about the church', 'Missionaries', 'Friends', 'Neighbors', 'Family', 'Social media'],
  ['Ways to share the gospel', 'Invite friends to church', 'Give a Book of Mormon', 'Serve others', 'Social media', 'Share your testimony'],
  // At church
  ['Things in the chapel', 'Pews', 'Hymnbooks', 'Pulpit', 'Piano', 'Organ', 'Sacrament table'],
  ['Things in a primary room', 'Little chairs', 'Piano', 'Pictures of Jesus', 'Songbooks', 'Chalkboard', 'Stickers'],
  ['Things in the church library', 'Manuals', 'Pictures', 'Scriptures', 'Hymnbooks', 'Posters'],
  ['Things in the bishop’s office', 'Desk', 'Couch', 'Chairs', 'Tissues', 'Calendar', 'Pictures of Jesus'],
  ['Pictures on the walls of the church', 'Jesus Christ', 'Temples', 'Joseph Smith', 'Prophets', 'The First Vision'],
  ['Things you find in the lost and found', 'Jackets', 'Water bottles', 'Scriptures', 'Single shoe', 'Sweaters', 'Umbrellas'],
  ['Things you find at a church bookstore', 'Scriptures', 'Hymnbooks', 'Pictures of Jesus', 'Church manuals', 'Gospel art'],
  ['Things kids leave behind in nursery', 'Blankets', 'Shoes', 'Sippy cups', 'Toys', 'Socks'],
  ['Snacks you might eat in nursery', 'Goldfish', 'Cheerios', 'Fruit snacks', 'Crackers', 'Graham crackers', 'Pretzels'],
  ['Activities you do in nursery', 'Playing with toys', 'Singing songs', 'Story time', 'Snack time', 'Coloring'],
  ['Favorite primary snack', 'Goldfish', 'Fruit snacks', 'Cookies', 'Popsicles', 'Pretzels', 'Cheerios'],
  ['Sacrament snacks for kids', 'Cheerios', 'Goldfish crackers', 'Fruit snacks', 'Graham crackers', 'Puffs'],
  ['Common Primary answers', 'Jesus', 'Pray', 'Read my scriptures', 'Go to church', 'Be kind', 'Temple'],
  ['Ways to entertain a toddler in church', 'Snacks', 'Coloring', 'Books', 'Quiet toys', 'Stickers', 'Walk in the hall'],
  ['Reasons people step out of a meeting', 'Crying baby', 'Bathroom break', 'Phone call', 'Fussy toddler', 'Cough'],
  ['Things in a diaper bag', 'Diapers', 'Wipes', 'Extra clothes', 'Bottle', 'Pacifier', 'Snacks'],
  ['Reasons Sunday meetings might be cancelled', 'Snow', 'Stake conference', 'General conference', 'Power outage', 'Pandemic'],
  ['Typical start time of sacrament meeting', '9:00', '10:00', '11:00', '8:30', '1:00'],
  ['Ways to get to church', 'Car', 'Walk', 'Bike', 'Carpool', 'Bus'],
  ['Reasons you are late to church or seminary', 'Overslept', 'Couldn’t find shoes', 'Traffic', 'Forgot something', 'Kids', 'Snooze button'],
  ['Ways to get ready for Sunday', 'Set out clothes', 'Iron clothes', 'Shine shoes', 'Take a bath', 'Go to bed early', 'Prepare lessons'],
  ['What to do before midnight on Saturday night', 'Buy groceries', 'Fill up the gas tank', 'Finish homework', 'Iron clothes', 'Take a bath', 'Polish shoes'],
  ['Sunday activities'],
  ['Favorite Sunday dinner foods', 'Roast', 'Funeral potatoes', 'Rolls', 'Mashed potatoes', 'Fried chicken', 'Pot roast'],
  ['Sacrament meeting talk topics', 'Faith', 'Repentance', 'Charity', 'Missionary work', 'Tithing', 'Gratitude'],
  ['Common church talk introductions', 'Good morning', 'Brothers and sisters', 'I’m grateful to be here today', 'The bishop asked me to speak', 'For those who don’t know me'],
  ['Special musical number instruments', 'Piano', 'Violin', 'Cello', 'Flute', 'Guitar', 'Ukulele'],
  ['Church clichés', 'Families can be together forever', 'Choose the right', 'Follow the prophet', 'Endure to the end', 'Come, follow me'],
  ['Church acronyms', 'FHE', 'YSA', 'RM', 'EQ', 'CTR', 'BYU'],
  ['Church slang', 'FHE', 'RM', 'Mutual', 'Ward', 'Sunday best'],
  ['Nicknames for the church', 'The Church', 'LDS', 'Mormon church', 'The gospel', 'Latter-day Saints'],
  ['Church publications', 'Liahona', 'Ensign', 'Friend', 'New Era', 'Church News'],
  ['Church TV movies and shows', 'Meet the Mormons', 'The Restoration', 'Emma Smith: My Story', 'Book of Mormon Videos'],
  ['Church performing groups', 'Tabernacle Choir', 'Orchestra at Temple Square', 'Bells on Temple Square'],
  ['Reasons to go to the church website', 'Find a meetinghouse', 'Read scriptures', 'Watch general conference', 'Find a temple', 'Family history', 'Donate tithing'],
  ['Who might you see at a baptism', 'Missionaries', 'Bishop', 'Parents', 'Grandparents', 'Friends'],
  ['People you invite to a baby blessing', 'Grandparents', 'Family', 'Friends', 'Neighbors', 'Aunts and uncles'],
  ['Reasons to get a priesthood blessing', 'Sickness', 'Surgery', 'Comfort', 'Guidance', 'Moving', 'Starting school'],
  ['Reasons people get offended'],

  // Music
  ['Primary songs', 'I Am a Child of God', 'Families Can Be Together Forever', 'I Love to See the Temple', 'Popcorn Popping', 'Jesus Wants Me for a Sunbeam'],
  ['Favorite hymns', 'Come, Come, Ye Saints', 'Praise to the Man', 'I Know That My Redeemer Lives', 'Called to Serve', 'The Spirit of God', 'Love at Home'],
  ['Christmas hymns', 'Silent Night', 'Joy to the World', 'O Come, All Ye Faithful', 'Away in a Manger', 'Hark! The Herald Angels Sing', 'O Little Town of Bethlehem'],
  ['Sacrament hymns', 'In Humility, Our Savior', 'Reverently and Meekly Now', 'As Now We Take the Sacrament', 'I Stand All Amazed', 'Behold the Great Redeemer Die'],
  ['Hymns that start with P', 'Praise to the Man', 'Press Forward, Saints', 'Praise to the Lord, the Almighty', 'Put Your Shoulder to the Wheel'],
  ['Easter hymns', 'He Is Risen!', 'I Know That My Redeemer Lives', 'Christ the Lord Is Risen Today'],
  ['Youth album songs'],
  ['Songs you might sing at camp', 'Kumbaya', 'Boom Chicka Boom', 'Home on the Range', 'Oh My Darling, Clementine', 'Down by the Bay'],

  // Camp and youth
  ['Things you forget to bring to camp', 'Toothbrush', 'Sleeping bag', 'Flashlight', 'Bug spray', 'Socks', 'Sunscreen'],
  ['Traditions at girls camp', 'Skits', 'Testimony meeting', 'Campfire', 'Crafts', 'Cabin cheers'],
  ['What to do at scout camp', 'Hike', 'Swim', 'Merit badges', 'Campfire', 'Archery', 'Fishing'],
  ['Good Mutual activities'],
  ['Something you could do at a youth activity', 'Play dodgeball', 'Play games', 'Service project', 'Eat pizza', 'Hike'],
  ['Things you do at a church dance', 'Dance', 'Eat snacks', 'Stand by the wall', 'Line dance', 'Take pictures'],
  ['Foods you crave while fasting', 'Pizza', 'Water', 'Cookies', 'Bread', 'Ice cream'],

  // General conference
  ['General conference traditions', 'Conference bingo', 'Cinnamon rolls', 'Pajamas', 'Special breakfast', 'Snacks'],
  ['General conference snacks', 'Popcorn', 'Cinnamon rolls', 'Doughnuts', 'Cookies', 'Candy', 'Fruit'],
  ['Favorite general conference speaker', 'President Nelson', 'Elder Holland', 'President Hinckley', 'Elder Uchtdorf', 'President Monson', 'Elder Bednar'],
  ['What to do between sessions', 'Eat', 'Nap', 'Play outside', 'Take a walk', 'Clean', 'Play games'],
  ['What people do during general conference', 'Nap', 'Eat snacks', 'Take notes', 'Color', 'Play conference bingo'],

  // Faith and home life
  ['Blessings we pray for', 'Health', 'Safety', 'Food', 'Family', 'Missionaries'],
  ['Blessings'],
  ['Things you pray for', 'Health', 'Family', 'Safety', 'Guidance', 'The sick'],
  ['Things you are grateful for', 'Family', 'Health', 'Home', 'Food', 'Friends', 'Scriptures'],
  ['Where you can pray', 'In bed', 'In the car', 'At church', 'At the table', 'In the temple'],
  ['Places to read the scriptures', 'In bed', 'On the couch', 'At the kitchen table', 'In the car', 'At church'],
  ['Places to study the gospel', 'Church', 'Home', 'Seminary', 'Institute', 'The temple'],
  ['Places you go to find peace', 'The temple', 'Nature', 'Church', 'Home', 'The mountains', 'Your bedroom'],
  ['Gospel habits and routines', 'Scripture study', 'Prayer', 'Church attendance', 'Family home evening', 'Fasting', 'Temple attendance'],
  ['Ways to grow testimonies', 'Pray', 'Read scriptures', 'Attend church', 'Serve others', 'Go to the temple', 'Fast'],
  ['Ways to do family history', 'FamilySearch', 'Interview grandparents', 'Visit cemeteries', 'Indexing', 'Scan photos', 'Write stories'],
  ['Life events', 'Birth', 'Baptism', 'Graduation', 'Marriage', 'Mission', 'Death'],
  ['Article of Faith number', '13', '1', '2', '3', '4'],
  ['Extended family members', 'Grandma', 'Grandpa', 'Aunt', 'Uncle', 'Cousin'],
  ['Roles of a father', 'Provider', 'Protector', 'Teacher', 'Priesthood holder', 'Presider'],
  ['Roles of a mother', 'Nurturer', 'Teacher', 'Caregiver', 'Friend', 'Example'],
  ['Things in your living room', 'Couch', 'Television', 'Lamp', 'Bookshelf', 'Family pictures'],
  ['Common wall hangings', 'Family pictures', 'Temple picture', 'Picture of Jesus', 'The Family Proclamation', 'Clock'],
  ['Faith-based accessories', 'CTR ring', 'Scripture bag', 'Temple bag', 'Name tag'],
  ['Common family vehicles', 'Minivan', 'Suburban', 'SUV', 'Truck', 'Station wagon', '15-passenger van'],
  ['Family chores', 'Dishes', 'Laundry', 'Vacuum', 'Take out the trash', 'Mow the lawn', 'Clean bathrooms'],
  ['Ways families bond', 'Game night', 'Dinner together', 'Vacations', 'Movie night', 'Family prayer', 'Hikes'],
  ['Family traditions', 'Sunday dinner', 'Game night', 'Family prayer', 'Holiday cookies', 'Annual camping trip'],
  ['Christmas traditions', 'Nativity play', 'Advent calendar', 'Reading Luke 2', 'Christmas Eve pajamas', 'Caroling', 'Cookies for neighbors'],
  ['Easter traditions', 'Egg hunt', 'Easter baskets', 'Ham dinner', 'Coloring eggs', 'New outfits'],
  ['New Year’s resolutions', 'Read scriptures daily', 'Exercise', 'Eat healthier', 'Read the Book of Mormon', 'Go to the temple'],
  ['Family home evening activities', 'Game night', 'Scripture story', 'Family prayer', 'Sing songs', 'Movie night', 'Treats'],
  ['Family home evening desserts', 'Brownies', 'Ice cream', 'Cookies', 'Popcorn', 'Cake', 'Pudding'],
  ['Free date night activities', 'Walk', 'Picnic', 'Hike', 'Stargazing', 'Game night', 'Movie at home'],
  ['Number of months you should date before marriage', '6', '12', '3', '9', '24'],

  // Food, jokes and culture
  ['Potluck dishes', 'Funeral potatoes', 'Jell-O salad', 'Rolls', 'Lasagna', 'Green bean casserole', 'Cookies'],
  ['Types of Jell-O', 'Lime', 'Strawberry', 'Orange', 'Cherry', 'Raspberry', 'Lemon'],
  ['Things to put on your ice cream', 'Sprinkles', 'Hot fudge', 'Whipped cream', 'Caramel', 'Cherry', 'Nuts'],
  ['BYU ice cream flavors'],
  ['Items you may find on the third shelf down of the 16th bookshelf at Deseret Book'],
  ['Items in your food storage', 'Wheat', 'Rice', 'Beans', 'Water', 'Oats', 'Powdered milk'],
  ['Pretend swear words'],
  ['Types of parties', 'Birthday', 'Baby shower', 'Bridal shower', 'Graduation', 'Ward Christmas party'],
  ['Words that rhyme with church', 'Perch', 'Search', 'Lurch', 'Birch', 'Research'],
  ['Colors of hair in Relief Society', 'Blonde', 'Brunette', 'Red', 'Gray', 'Black'],
  ['Tie patterns', 'Stripes', 'Solid', 'Paisley', 'Polka dots', 'Plaid'],
  ['Ways to greet someone', 'Hello', 'Hi', 'Handshake', 'Hug', 'Wave', 'Smile'],

  // More prompts for a fresh mix of scripture, ward, family and youth-life answers.
  ['Things you see at a temple open house', 'Baptistry', 'Celestial room', 'Sealing room', 'Chandelier', 'Waiting area', 'Spiral staircase'],
  ['Items for family scripture study', 'Scriptures', 'Notebook', 'Pencil', 'Reading glasses', 'Bookmark', 'Study guide'],
  ['Things you might see in a Primary lesson', 'Pictures of Jesus', 'Scripture story', 'Coloring page', 'Songbook', 'Whiteboard', 'Flannel board'],
  ['Family history discoveries', 'Birth record', 'Old photograph', 'Census page', 'Immigration record', 'Family story', 'Marriage certificate'],
  ['Things youth bring to camp', 'Sleeping bag', 'Flashlight', 'Water bottle', 'Hiking shoes', 'Sunscreen', 'Bug spray'],
  ['Pioneer handcart supplies', 'Flour sack', 'Cooking pot', 'Blanket', 'Water barrel', 'Sewing kit', 'Walking stick'],
  ['Things people do on Fast Sunday', 'Skip a meal', 'Pray', 'Share a testimony', 'Donate a fast offering', 'Drink water', 'Attend church'],
  ['Church building maintenance chores', 'Vacuum the chapel', 'Empty trash cans', 'Wipe the tables', 'Mow the lawn', 'Shovel the sidewalk', 'Arrange chairs'],
  ['Reasons a Sunday lesson runs long', 'Many questions', 'A long story', 'Late start', 'Interesting discussion', 'Extra announcements'],
  ['Things on a missionary name tag', 'Missionary name', 'Church name', 'Country flag', 'First name', 'Jesus Christ'],
  ['Foods at a ward potluck', 'Funeral potatoes', 'Green salad', 'Rolls', 'Chili', 'Brownies', 'Fruit salad'],
  ['Things to pack for a temple trip', 'Temple clothes', 'Recommend', 'Hairbrush', 'Water bottle', 'Church shoes', 'Scriptures'],
  ['Common family history interview questions', 'Where were you born', 'What was your first job', 'How did you meet', 'What was your home like', 'What do you remember about school'],
  ['Things a youth leader might bring', 'Attendance list', 'Snacks', 'First aid kit', 'Activity plan', 'Scriptures', 'Name tags'],
  ['Reasons a ward activity gets rescheduled', 'Snowstorm', 'Building repair', 'Low attendance', 'Power outage', 'Schedule conflict'],
];

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const PROMPTS: Prompt[] = RAW.map(([text, ...samples]) => ({ id: slug(text), text, samples }));

export const PROMPT_BY_ID: ReadonlyMap<string, Prompt> = new Map(PROMPTS.map((p) => [p.id, p]));

/** What a bot writes for a prompt with no samples. Common, plausible answers, so bots sometimes match. */
export const GENERIC_ANSWERS: readonly string[] = [
  'Family',
  'Temple',
  'Church',
  'Prayer',
  'Scriptures',
  'Service',
  'Faith',
  'Love',
  'Food',
  'Home',
  'Missionaries',
  'Jesus',
];

// Merged from the owner's notes (kept the first form):
//  "living apostle" / "living apostles"; "families" repeats; "parts of the plan of salvation" (x3);
//  "places where there's lots of members" (x3); "Things tithing funds" / "Things tithing is used for";
//  "Common family vehicles" / "family vehicles"; "FHE activities" / "family home evening activities";
//  "Church historic sites" / "church history sites"; "Church start time" / "Typical start time of
//  sacrament meeting"; "Ward callings" / "callings"; "Campfire songs" / "Songs you might sing at camp";
//  "Non swear-word exclamatories" / "Pretend swear words".
