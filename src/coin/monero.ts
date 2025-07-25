import { input, confirm } from '@inquirer/prompts';
import { base58 } from '@scure/base';
import { Helper } from '../helper';
import { BIP32Interface } from 'bip32';
import { keccak_256 } from '@noble/hashes/sha3';
import { ed25519 } from "@noble/curves/ed25519";
import { str as crc32Str } from "crc-32";
import { Coin } from './coin';
import * as fs from 'fs/promises';

export class Monero implements Coin {
    code = 'XMR';
    purpose = '44';
    coin = '128';
    account = '0';
    change = '0';
    helper: Helper;

    private unit = 'sat/byte';
    private color = '\x1b[38;5;166m';
    private satoshi = 10 ** 8;

    private wordList = [
        'abbey', 'abducts', 'ability', 'ablaze', 'abnormal', 'abort', 'abrasive', 'absorb', 'abyss', 'academy', 'aces', 'aching', 'acidic', 'acoustic',
        'acquire', 'across', 'actress', 'acumen', 'adapt', 'addicted', 'adept', 'adhesive', 'adjust', 'adopt', 'adrenalin', 'adult', 'adventure', 'aerial',
        'afar', 'affair', 'afield', 'afloat', 'afoot', 'afraid', 'after', 'against', 'agenda', 'aggravate', 'agile', 'aglow', 'agnostic', 'agony', 'agreed',
        'ahead', 'aided', 'ailments', 'aimless', 'airport', 'aisle', 'ajar', 'akin', 'alarms', 'album', 'alchemy', 'alerts', 'algebra', 'alkaline', 'alley',
        'almost', 'aloof', 'alpine', 'already', 'also', 'altitude', 'alumni', 'always', 'amaze', 'ambush', 'amended', 'amidst', 'ammo', 'amnesty', 'among',
        'amply', 'amused', 'anchor', 'android', 'anecdote', 'angled', 'ankle', 'annoyed', 'answers', 'antics', 'anvil', 'anxiety', 'anybody', 'apart',
        'apex', 'aphid', 'aplomb', 'apology', 'apply', 'apricot', 'aptitude', 'aquarium', 'arbitrary', 'archer', 'ardent', 'arena', 'argue', 'arises',
        'army', 'around', 'arrow', 'arsenic', 'artistic', 'ascend', 'ashtray', 'aside', 'asked', 'asleep', 'aspire', 'assorted', 'asylum', 'athlete',
        'atlas', 'atom', 'atrium', 'attire', 'auburn', 'auctions', 'audio', 'august', 'aunt', 'austere', 'autumn', 'avatar', 'avidly', 'avoid', 'awakened',
        'awesome', 'awful', 'awkward', 'awning', 'awoken', 'axes', 'axis', 'axle', 'aztec', 'azure', 'baby', 'bacon', 'badge', 'baffles', 'bagpipe',
        'bailed', 'bakery', 'balding', 'bamboo', 'banjo', 'baptism', 'basin', 'batch', 'bawled', 'bays', 'because', 'beer', 'befit', 'begun', 'behind',
        'being', 'below', 'bemused', 'benches', 'berries', 'bested', 'betting', 'bevel', 'beware', 'beyond', 'bias', 'bicycle', 'bids', 'bifocals',
        'biggest', 'bikini', 'bimonthly', 'binocular', 'biology', 'biplane', 'birth', 'biscuit', 'bite', 'biweekly', 'blender', 'blip', 'bluntly', 'boat',
        'bobsled', 'bodies', 'bogeys', 'boil', 'boldly', 'bomb', 'border', 'boss', 'both', 'bounced', 'bovine', 'bowling', 'boxes', 'boyfriend', 'broken',
        'brunt', 'bubble', 'buckets', 'budget', 'buffet', 'bugs', 'building', 'bulb', 'bumper', 'bunch', 'business', 'butter', 'buying', 'buzzer', 'bygones',
        'byline', 'bypass', 'cabin', 'cactus', 'cadets', 'cafe', 'cage', 'cajun', 'cake', 'calamity', 'camp', 'candy', 'casket', 'catch', 'cause', 'cavernous',
        'cease', 'cedar', 'ceiling', 'cell', 'cement', 'cent', 'certain', 'chlorine', 'chrome', 'cider', 'cigar', 'cinema', 'circle', 'cistern', 'citadel',
        'civilian', 'claim', 'click', 'clue', 'coal', 'cobra', 'cocoa', 'code', 'coexist', 'coffee', 'cogs', 'cohesive', 'coils', 'colony', 'comb', 'cool',
        'copy', 'corrode', 'costume', 'cottage', 'cousin', 'cowl', 'criminal', 'cube', 'cucumber', 'cuddled', 'cuffs', 'cuisine', 'cunning', 'cupcake',
        'custom', 'cycling', 'cylinder', 'cynical', 'dabbing', 'dads', 'daft', 'dagger', 'daily', 'damp', 'dangerous', 'dapper', 'darted', 'dash', 'dating',
        'dauntless', 'dawn', 'daytime', 'dazed', 'debut', 'decay', 'dedicated', 'deepest', 'deftly', 'degrees', 'dehydrate', 'deity', 'dejected', 'delayed',
        'demonstrate', 'dented', 'deodorant', 'depth', 'desk', 'devoid', 'dewdrop', 'dexterity', 'dialect', 'dice', 'diet', 'different', 'digit', 'dilute',
        'dime', 'dinner', 'diode', 'diplomat', 'directed', 'distance', 'ditch', 'divers', 'dizzy', 'doctor', 'dodge', 'does', 'dogs', 'doing', 'dolphin',
        'domestic', 'donuts', 'doorway', 'dormant', 'dosage', 'dotted', 'double', 'dove', 'down', 'dozen', 'dreams', 'drinks', 'drowning', 'drunk', 'drying',
        'dual', 'dubbed', 'duckling', 'dude', 'duets', 'duke', 'dullness', 'dummy', 'dunes', 'duplex', 'duration', 'dusted', 'duties', 'dwarf', 'dwelt',
        'dwindling', 'dying', 'dynamite', 'dyslexic', 'each', 'eagle', 'earth', 'easy', 'eating', 'eavesdrop', 'eccentric', 'echo', 'eclipse', 'economics',
        'ecstatic', 'eden', 'edgy', 'edited', 'educated', 'eels', 'efficient', 'eggs', 'egotistic', 'eight', 'either', 'eject', 'elapse', 'elbow', 'eldest',
        'eleven', 'elite', 'elope', 'else', 'eluded', 'emails', 'ember', 'emerge', 'emit', 'emotion', 'empty', 'emulate', 'energy', 'enforce', 'enhanced',
        'enigma', 'enjoy', 'enlist', 'enmity', 'enough', 'enraged', 'ensign', 'entrance', 'envy', 'epoxy', 'equip', 'erase', 'erected', 'erosion', 'error',
        'eskimos', 'espionage', 'essential', 'estate', 'etched', 'eternal', 'ethics', 'etiquette', 'evaluate', 'evenings', 'evicted', 'evolved', 'examine',
        'excess', 'exhale', 'exit', 'exotic', 'exquisite', 'extra', 'exult', 'fabrics', 'factual', 'fading', 'fainted', 'faked', 'fall', 'family', 'fancy',
        'farming', 'fatal', 'faulty', 'fawns', 'faxed', 'fazed', 'feast', 'february', 'federal', 'feel', 'feline', 'females', 'fences', 'ferry', 'festival',
        'fetches', 'fever', 'fewest', 'fiat', 'fibula', 'fictional', 'fidget', 'fierce', 'fifteen', 'fight', 'films', 'firm', 'fishing', 'fitting', 'five',
        'fixate', 'fizzle', 'fleet', 'flippant', 'flying', 'foamy', 'focus', 'foes', 'foggy', 'foiled', 'folding', 'fonts', 'foolish', 'fossil', 'fountain',
        'fowls', 'foxes', 'foyer', 'framed', 'friendly', 'frown', 'fruit', 'frying', 'fudge', 'fuel', 'fugitive', 'fully', 'fuming', 'fungal', 'furnished',
        'fuselage', 'future', 'fuzzy', 'gables', 'gadget', 'gags', 'gained', 'galaxy', 'gambit', 'gang', 'gasp', 'gather', 'gauze', 'gave', 'gawk', 'gaze',
        'gearbox', 'gecko', 'geek', 'gels', 'gemstone', 'general', 'geometry', 'germs', 'gesture', 'getting', 'geyser', 'ghetto', 'ghost', 'giant', 'giddy',
        'gifts', 'gigantic', 'gills', 'gimmick', 'ginger', 'girth', 'giving', 'glass', 'gleeful', 'glide', 'gnaw', 'gnome', 'goat', 'goblet', 'godfather',
        'goes', 'goggles', 'going', 'goldfish', 'gone', 'goodbye', 'gopher', 'gorilla', 'gossip', 'gotten', 'gourmet', 'governing', 'gown', 'greater', 'grunt',
        'guarded', 'guest', 'guide', 'gulp', 'gumball', 'guru', 'gusts', 'gutter', 'guys', 'gymnast', 'gypsy', 'gyrate', 'habitat', 'hacksaw', 'haggled',
        'hairy', 'hamburger', 'happens', 'hashing', 'hatchet', 'haunted', 'having', 'hawk', 'haystack', 'hazard', 'hectare', 'hedgehog', 'heels', 'hefty',
        'height', 'hemlock', 'hence', 'heron', 'hesitate', 'hexagon', 'hickory', 'hiding', 'highway', 'hijack', 'hiker', 'hills', 'himself', 'hinder', 'hippo',
        'hire', 'history', 'hitched', 'hive', 'hoax', 'hobby', 'hockey', 'hoisting', 'hold', 'honked', 'hookup', 'hope', 'hornet', 'hospital', 'hotel',
        'hounded', 'hover', 'howls', 'hubcaps', 'huddle', 'huge', 'hull', 'humid', 'hunter', 'hurried', 'husband', 'huts', 'hybrid', 'hydrogen', 'hyper',
        'iceberg', 'icing', 'icon', 'identity', 'idiom', 'idled', 'idols', 'igloo', 'ignore', 'iguana', 'illness', 'imagine', 'imbalance', 'imitate', 'impel',
        'inactive', 'inbound', 'incur', 'industrial', 'inexact', 'inflamed', 'ingested', 'initiate', 'injury', 'inkling', 'inline', 'inmate', 'innocent',
        'inorganic', 'input', 'inquest', 'inroads', 'insult', 'intended', 'inundate', 'invoke', 'inwardly', 'ionic', 'irate', 'iris', 'irony', 'irritate',
        'island', 'isolated', 'issued', 'italics', 'itches', 'items', 'itinerary', 'itself', 'ivory', 'jabbed', 'jackets', 'jaded', 'jagged', 'jailed',
        'jamming', 'january', 'jargon', 'jaunt', 'javelin', 'jaws', 'jazz', 'jeans', 'jeers', 'jellyfish', 'jeopardy', 'jerseys', 'jester', 'jetting', 'jewels',
        'jigsaw', 'jingle', 'jittery', 'jive', 'jobs', 'jockey', 'jogger', 'joining', 'joking', 'jolted', 'jostle', 'journal', 'joyous', 'jubilee', 'judge',
        'juggled', 'juicy', 'jukebox', 'july', 'jump', 'junk', 'jury', 'justice', 'juvenile', 'kangaroo', 'karate', 'keep', 'kennel', 'kept', 'kernels',
        'kettle', 'keyboard', 'kickoff', 'kidneys', 'king', 'kiosk', 'kisses', 'kitchens', 'kiwi', 'knapsack', 'knee', 'knife', 'knowledge', 'knuckle',
        'koala', 'laboratory', 'ladder', 'lagoon', 'lair', 'lakes', 'lamb', 'language', 'laptop', 'large', 'last', 'later', 'launching', 'lava', 'lawsuit',
        'layout', 'lazy', 'lectures', 'ledge', 'leech', 'left', 'legion', 'leisure', 'lemon', 'lending', 'leopard', 'lesson', 'lettuce', 'lexicon', 'liar',
        'library', 'licks', 'lids', 'lied', 'lifestyle', 'light', 'likewise', 'lilac', 'limits', 'linen', 'lion', 'lipstick', 'liquid', 'listen', 'lively',
        'loaded', 'lobster', 'locker', 'lodge', 'lofty', 'logic', 'loincloth', 'long', 'looking', 'lopped', 'lordship', 'losing', 'lottery', 'loudly', 'love',
        'lower', 'loyal', 'lucky', 'luggage', 'lukewarm', 'lullaby', 'lumber', 'lunar', 'lurk', 'lush', 'luxury', 'lymph', 'lynx', 'lyrics', 'macro', 'madness',
        'magically', 'mailed', 'major', 'makeup', 'malady', 'mammal', 'maps', 'masterful', 'match', 'maul', 'maverick', 'maximum', 'mayor', 'maze', 'meant',
        'mechanic', 'medicate', 'meeting', 'megabyte', 'melting', 'memoir', 'menu', 'merger', 'mesh', 'metro', 'mews', 'mice', 'midst', 'mighty', 'mime', 'mirror',
        'misery', 'mittens', 'mixture', 'moat', 'mobile', 'mocked', 'mohawk', 'moisture', 'molten', 'moment', 'money', 'moon', 'mops', 'morsel', 'mostly',
        'motherly', 'mouth', 'movement', 'mowing', 'much', 'muddy', 'muffin', 'mugged', 'mullet', 'mumble', 'mundane', 'muppet', 'mural', 'musical', 'muzzle',
        'myriad', 'mystery', 'myth', 'nabbing', 'nagged', 'nail', 'names', 'nanny', 'napkin', 'narrate', 'nasty', 'natural', 'nautical', 'navy', 'nearby',
        'necklace', 'needed', 'negative', 'neither', 'neon', 'nephew', 'nerves', 'nestle', 'network', 'neutral', 'never', 'newt', 'nexus', 'nibs', 'niche',
        'niece', 'nifty', 'nightly', 'nimbly', 'nineteen', 'nirvana', 'nitrogen', 'nobody', 'nocturnal', 'nodes', 'noises', 'nomad', 'noodles', 'northern',
        'nostril', 'noted', 'nouns', 'novelty', 'nowhere', 'nozzle', 'nuance', 'nucleus', 'nudged', 'nugget', 'nuisance', 'null', 'number', 'nuns', 'nurse',
        'nutshell', 'nylon', 'oaks', 'oars', 'oasis', 'oatmeal', 'obedient', 'object', 'obliged', 'obnoxious', 'observant', 'obtains', 'obvious', 'occur',
        'ocean', 'october', 'odds', 'odometer', 'offend', 'often', 'oilfield', 'ointment', 'okay', 'older', 'olive', 'olympics', 'omega', 'omission', 'omnibus',
        'onboard', 'oncoming', 'oneself', 'ongoing', 'onion', 'online', 'onslaught', 'onto', 'onward', 'oozed', 'opacity', 'opened', 'opposite', 'optical',
        'opus', 'orange', 'orbit', 'orchid', 'orders', 'organs', 'origin', 'ornament', 'orphans', 'oscar', 'ostrich', 'otherwise', 'otter', 'ouch', 'ought',
        'ounce', 'ourselves', 'oust', 'outbreak', 'oval', 'oven', 'owed', 'owls', 'owner', 'oxidant', 'oxygen', 'oyster', 'ozone', 'pact', 'paddles', 'pager',
        'pairing', 'palace', 'pamphlet', 'pancakes', 'paper', 'paradise', 'pastry', 'patio', 'pause', 'pavements', 'pawnshop', 'payment', 'peaches', 'pebbles',
        'peculiar', 'pedantic', 'peeled', 'pegs', 'pelican', 'pencil', 'people', 'pepper', 'perfect', 'pests', 'petals', 'phase', 'pheasants', 'phone', 'phrases',
        'physics', 'piano', 'picked', 'pierce', 'pigment', 'piloted', 'pimple', 'pinched', 'pioneer', 'pipeline', 'pirate', 'pistons', 'pitched', 'pivot',
        'pixels', 'pizza', 'playful', 'pledge', 'pliers', 'plotting', 'plus', 'plywood', 'poaching', 'pockets', 'podcast', 'poetry', 'point', 'poker', 'polar',
        'ponies', 'pool', 'popular', 'portents', 'possible', 'potato', 'pouch', 'poverty', 'powder', 'pram', 'present', 'pride', 'problems', 'pruned', 'prying',
        'psychic', 'public', 'puck', 'puddle', 'puffin', 'pulp', 'pumpkins', 'punch', 'puppy', 'purged', 'push', 'putty', 'puzzled', 'pylons', 'pyramid', 'python',
        'queen', 'quick', 'quote', 'rabbits', 'racetrack', 'radar', 'rafts', 'rage', 'railway', 'raking', 'rally', 'ramped', 'randomly', 'rapid', 'rarest',
        'rash', 'rated', 'ravine', 'rays', 'razor', 'react', 'rebel', 'recipe', 'reduce', 'reef', 'refer', 'regular', 'reheat', 'reinvest', 'rejoices', 'rekindle',
        'relic', 'remedy', 'renting', 'reorder', 'repent', 'request', 'reruns', 'rest', 'return', 'reunion', 'revamp', 'rewind', 'rhino', 'rhythm', 'ribbon',
        'richly', 'ridges', 'rift', 'rigid', 'rims', 'ringing', 'riots', 'ripped', 'rising', 'ritual', 'river', 'roared', 'robot', 'rockets', 'rodent', 'rogue',
        'roles', 'romance', 'roomy', 'roped', 'roster', 'rotate', 'rounded', 'rover', 'rowboat', 'royal', 'ruby', 'rudely', 'ruffled', 'rugged', 'ruined', 'ruling',
        'rumble', 'runway', 'rural', 'rustled', 'ruthless', 'sabotage', 'sack', 'sadness', 'safety', 'saga', 'sailor', 'sake', 'salads', 'sample', 'sanity',
        'sapling', 'sarcasm', 'sash', 'satin', 'saucepan', 'saved', 'sawmill', 'saxophone', 'sayings', 'scamper', 'scenic', 'school', 'science', 'scoop', 'scrub',
        'scuba', 'seasons', 'second', 'sedan', 'seeded', 'segments', 'seismic', 'selfish', 'semifinal', 'sensible', 'september', 'sequence', 'serving', 'session',
        'setup', 'seventh', 'sewage', 'shackles', 'shelter', 'shipped', 'shocking', 'shrugged', 'shuffled', 'shyness', 'siblings', 'sickness', 'sidekick', 'sieve',
        'sifting', 'sighting', 'silk', 'simplest', 'sincerely', 'sipped', 'siren', 'situated', 'sixteen', 'sizes', 'skater', 'skew', 'skirting', 'skulls', 'skydive',
        'slackens', 'sleepless', 'slid', 'slower', 'slug', 'smash', 'smelting', 'smidgen', 'smog', 'smuggled', 'snake', 'sneeze', 'sniff', 'snout', 'snug', 'soapy',
        'sober', 'soccer', 'soda', 'software', 'soggy', 'soil', 'solved', 'somewhere', 'sonic', 'soothe', 'soprano', 'sorry', 'southern', 'sovereign', 'sowed',
        'soya', 'space', 'speedy', 'sphere', 'spiders', 'splendid', 'spout', 'sprig', 'spud', 'spying', 'square', 'stacking', 'stellar', 'stick', 'stockpile',
        'strained', 'stunning', 'stylishly', 'subtly', 'succeed', 'suddenly', 'suede', 'suffice', 'sugar', 'suitcase', 'sulking', 'summon', 'sunken', 'superior',
        'surfer', 'sushi', 'suture', 'swagger', 'swept', 'swiftly', 'sword', 'swung', 'syllabus', 'symptoms', 'syndrome', 'syringe', 'system', 'taboo', 'tacit',
        'tadpoles', 'tagged', 'tail', 'taken', 'talent', 'tamper', 'tanks', 'tapestry', 'tarnished', 'tasked', 'tattoo', 'taunts', 'tavern', 'tawny', 'taxi',
        'teardrop', 'technical', 'tedious', 'teeming', 'tell', 'template', 'tender', 'tepid', 'tequila', 'terminal', 'testing', 'tether', 'textbook', 'thaw',
        'theatrics', 'thirsty', 'thorn', 'threaten', 'thumbs', 'thwart', 'ticket', 'tidy', 'tiers', 'tiger', 'tilt', 'timber', 'tinted', 'tipsy', 'tirade',
        'tissue', 'titans', 'toaster', 'tobacco', 'today', 'toenail', 'toffee', 'together', 'toilet', 'token', 'tolerant', 'tomorrow', 'tonic', 'toolbox',
        'topic', 'torch', 'tossed', 'total', 'touchy', 'towel', 'toxic', 'toyed', 'trash', 'trendy', 'tribal', 'trolling', 'truth', 'trying', 'tsunami', 'tubes',
        'tucks', 'tudor', 'tuesday', 'tufts', 'tugs', 'tuition', 'tulips', 'tumbling', 'tunnel', 'turnip', 'tusks', 'tutor', 'tuxedo', 'twang', 'tweezers',
        'twice', 'twofold', 'tycoon', 'typist', 'tyrant', 'ugly', 'ulcers', 'ultimate', 'umbrella', 'umpire', 'unafraid', 'unbending', 'uncle', 'under', 'uneven',
        'unfit', 'ungainly', 'unhappy', 'union', 'unjustly', 'unknown', 'unlikely', 'unmask', 'unnoticed', 'unopened', 'unplugs', 'unquoted', 'unrest', 'unsafe',
        'until', 'unusual', 'unveil', 'unwind', 'unzip', 'upbeat', 'upcoming', 'update', 'upgrade', 'uphill', 'upkeep', 'upload', 'upon', 'upper', 'upright',
        'upstairs', 'uptight', 'upwards', 'urban', 'urchins', 'urgent', 'usage', 'useful', 'usher', 'using', 'usual', 'utensils', 'utility', 'utmost', 'utopia',
        'uttered', 'vacation', 'vague', 'vain', 'value', 'vampire', 'vane', 'vapidly', 'vary', 'vastness', 'vats', 'vaults', 'vector', 'veered', 'vegan', 'vehicle',
        'vein', 'velvet', 'venomous', 'verification', 'vessel', 'veteran', 'vexed', 'vials', 'vibrate', 'victim', 'video', 'viewpoint', 'vigilant', 'viking', 'village',
        'vinegar', 'violin', 'vipers', 'virtual', 'visited', 'vitals', 'vivid', 'vixen', 'vocal', 'vogue', 'voice', 'volcano', 'vortex', 'voted', 'voucher',
        'vowels', 'voyage', 'vulture', 'wade', 'waffle', 'wagtail', 'waist', 'waking', 'wallets', 'wanted', 'warped', 'washing', 'water', 'waveform', 'waxing',
        'wayside', 'weavers', 'website', 'wedge', 'weekday', 'weird', 'welders', 'went', 'wept', 'were', 'western', 'wetsuit', 'whale', 'when', 'whipped', 'whole',
        'wickets', 'width', 'wield', 'wife', 'wiggle', 'wildly', 'winter', 'wipeout', 'wiring', 'wise', 'withdrawn', 'wives', 'wizard', 'wobbly', 'woes', 'woken',
        'wolf', 'womanly', 'wonders', 'woozy', 'worry', 'wounded', 'woven', 'wrap', 'wrist', 'wrong', 'yacht', 'yahoo', 'yanks', 'yard', 'yawning', 'yearbook',
        'yellow', 'yesterday', 'yeti', 'yields', 'yodel', 'yoga', 'younger', 'yoyo', 'zapped', 'zeal', 'zebra', 'zero', 'zesty', 'zigzags', 'zinger', 'zippers',
        'zodiac', 'zombie', 'zones', 'zoom'
    ];

    constructor(helper: Helper) {
        this.helper = helper;
    }

    init(): void { }

    async showKeyInfo(root: BIP32Interface, index: string): Promise<void> {
        const child = root.derivePath(`m/${this.purpose}'/${this.coin}'/${this.account}'/${this.change}/${index}`);

        let detail = `-----------m/${this.purpose}'/${this.coin}'/${this.account}'/${this.change}/${index}-------------------\n`;

        const bip39Pk = child.privateKey.toString('hex');
        const privateSpendKey = this.scReduce32(bip39Pk);
        const privateViewKey = this.pskToPvk(privateSpendKey);
        const publicSpendKey = this.getPublicKey(privateSpendKey);
        const publicViewKey = this.getPublicKey(privateViewKey);
        const address = this.generateMoneroAddress(publicSpendKey, publicViewKey);
        const mnemonic = this.generateMnemonic(privateSpendKey);

        detail += `BIP39 Private Key: ${bip39Pk}\n`;
        detail += `Monero Mnemonic: ${mnemonic}\n`;
        detail += `Private Spend Key: ${privateSpendKey}\n`;
        detail += `Private View Key: ${privateViewKey}\n`;
        detail += `Public Spend Key: ${publicSpendKey}\n`;
        detail += `Public View Key: ${publicViewKey}\n`;
        detail += `Monero Address: ${address}\n`;
        detail += `Monero Sub Address0: ${this.generateMoneroSubAddress(privateViewKey, publicSpendKey, publicViewKey, 0, 0)}\n`;
        detail += `Monero Sub Address1: ${this.generateMoneroSubAddress(privateViewKey, publicSpendKey, publicViewKey, 0, 1)}\n`;
        detail += `Monero Sub Address2: ${this.generateMoneroSubAddress(privateViewKey, publicSpendKey, publicViewKey, 0, 2)}\n`;
        detail += `Monero Sub Address3: ${this.generateMoneroSubAddress(privateViewKey, publicSpendKey, publicViewKey, 0, 3)}\n`;
        detail += '------------------------------------------------\n';

        this.helper.print(this.color, detail);
    }

    async showAddressDetail(xpub: BIP32Interface, accountName: string, index: string): Promise<void> {
        const ck = xpub.derivePath(`${String(this.account)}/${index}`);
        const address = '';

        const addr = await this.getAddr(address);
        this.helper.print(this.color, `|${index}|${address}|${addr.balance / this.satoshi}`);

        const utxos = await this.getUtxos(address);
        this.helper.print(this.color, '---------------------UTXO---------------------');
        utxos.forEach(utxo => this.helper.print(this.color, `|${utxo.vout}|${utxo.txid}|${utxo.value}`));

        this.helper.updateDb(accountName, index, addr.balance + addr.unBalance);
    }

    async showUsingAddresses(xpub: BIP32Interface, accountName: string): Promise<void> {
        let total = 0;
        const using_addrs = this.helper.getUsingAddresses(accountName);

        for (const a of using_addrs) {
            const ck = xpub.derivePath(`${String(this.account)}/${a.idx}`);
            const address = '';

            const addr = await this.getAddr(address);
            this.helper.print(this.color, `|${a.idx}|${address}|${addr.balance / this.satoshi}`);
            total += addr.balance;

            this.helper.updateDb(accountName, a.idx, addr.balance + addr.unBalance);
        }

        console.log(`Total Balance: ${total / this.satoshi}`);
    }

    async createTx(): Promise<void> {

    }

    async sign(tx: any): Promise<void> {
        const chunks: Uint8Array[] = [];

        chunks.push(this.encodeVarint(tx.version));
        chunks.push(this.encodeVarint(tx.unlockTime));

        // Serialize inputs
        chunks.push(this.encodeVarint(tx.vin.length));
        for (const input of tx.vin) {
            chunks.push(new Uint8Array([0x02])); // vin tag: 0x02 for "key"
            chunks.push(this.encodeVarint(input.keyOffsets.length));
            for (const offset of input.keyOffsets) {
                chunks.push(this.encodeVarint(offset));
            }
            chunks.push(input.keyImage);
        }

        // Serialize outputs
        chunks.push(this.encodeVarint(tx.vout.length));
        for (const output of tx.vout) {
            chunks.push(this.encodeVarint(output.amount)); // 0 for RingCT
            chunks.push(new Uint8Array([0x02])); // vout tag: 0x02 for "to_key"
            chunks.push(output.stealthPublicKey);
        }

        // Serialize extra
        const extraCombined = Uint8Array.from(tx.extra.flatMap(b => Array.from(b)));
        chunks.push(this.encodeVarint(extraCombined.length));
        chunks.push(extraCombined);

        // Concatenate all
        const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
        const buffer = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            buffer.set(chunk, offset);
            offset += chunk.length;
        }
    }

    private async getAddr(address: string): Promise<any> {
        let resp = await this.helper.api.get(`https://api.whatsonchain.com/v1/bsv/main/address/${address}/confirmed/balance`);
        const balance = resp.data['confirmed'];
        resp = await this.helper.api.get(`https://api.whatsonchain.com/v1/bsv/main/address/${address}/unconfirmed/balance`);
        const unBalance = resp.data['unconfirmed'];

        return { balance: balance, unBalance: unBalance };
    }

    private async getUtxos(address: string): Promise<any[]> {
        const resp = await this.helper.api.get(`https://api.whatsonchain.com/v1/bsv/main/address/${address}/confirmed/unspent`);
        const utxos = [];
        if (resp.data === 'Not Found') {
            return utxos;
        }
        resp.data['result'].forEach(utxo => {
            utxos.push({ txid: utxo['tx_hash'], vout: utxo['tx_pos'], value: utxo['value'] });
        });

        return utxos;
    }

    private async getFee(): Promise<number> {
        return 1;
    }

    private encodeVarint(n: number): Uint8Array {
        const out: number[] = [];
        while (n >= 0x80) {
            out.push((n & 0x7f) | 0x80);
            n >>= 7;
        }
        out.push(n);
        return new Uint8Array(out);
    }

    private scReduce32(seedHex: string): string {
        const leSeed = this.helper.hexToLE(seedHex);
        const seedInt = BigInt("0x" + leSeed);
        const reducedInt = seedInt % ed25519.CURVE.n;
        return this.helper.hexToLE(reducedInt.toString(16).padStart(64, "0"));
    }

    private pskToPvk(privateSpendKey: string): string {
        const hashedSeed = keccak_256(Buffer.from(privateSpendKey, 'hex'));
        return this.scReduce32(Buffer.from(hashedSeed).toString('hex'));
    }

    /** Generate Ed25519 public key from private key */
    private getPublicKey(privateKeyHex: string): string {
        const leSeed = this.helper.hexToLE(privateKeyHex);
        const privScalar = ed25519.CURVE.Fp.create(BigInt("0x" + leSeed));
        const pubPoint = ed25519.Point.BASE.multiply(privScalar);
        return pubPoint.toHex();
    }

    // Monero's address construction:
    // network byte + public spend key + public view key + checksum
    private generateMoneroAddress(publicSpendKey: string, publicViewKey: string): string {
        return this.encodeAddress(18, publicSpendKey, publicViewKey);
    }

    /** Generate Monero subaddress from spend/view keys and account/index */
    private generateMoneroSubAddress(privateViewKey: string, publicSpendKey: string, publicViewKey: string, account: number, index: number): string {
        // no need to calculate sub address if account and index are both 0
        if (account === 0 && index === 0) {
            return this.generateMoneroAddress(publicSpendKey, publicViewKey);
        }

        // 1. Derive m = Hs("SubAddr" + private view key + major + minor)
        const subAddr = '5375624164647200'; // "SubAddr"
        const a = privateViewKey;
        const major = this.helper.hexToLE(account.toString(16).padStart(8, '0'));
        const minor = this.helper.hexToLE(index.toString(16).padStart(8, '0'));
        const data = subAddr + a + major + minor;
        const mHash = keccak_256(Buffer.from(data, 'hex'));
        const m = BigInt('0x' + Buffer.from(mHash).toString('hex')) % ed25519.CURVE.n;

        // 2. Derive sub-spend key: sub_spend = publicSpendKey + m * G
        const mG = ed25519.Point.BASE.multiply(m);
        const subSpendPoint = ed25519.Point.fromHex(publicSpendKey).add(mG);
        const subSpendKey = subSpendPoint.toHex();

        // 3. Derive sub-view key: private view key * sub-spend key
        const privateViewKeyScalar = BigInt('0x' + privateViewKey) % ed25519.CURVE.n;
        const derivedViewPoint = subSpendPoint.multiply(privateViewKeyScalar);
        const subViewKey = derivedViewPoint.toHex();

        return this.encodeAddress(42, subSpendKey, subViewKey);
    }

    /** Build and encode Monero address */
    private encodeAddress(prefix: number, publicSpendKey: string, publicViewKey: string): string {
        let data = `${prefix.toString(16)}${publicSpendKey}${publicViewKey}`;
        const checksum = keccak_256(Buffer.from(data, 'hex')).slice(0, 4);
        data = `${data}${Buffer.from(checksum).toString('hex')}`;

        return this.encodeMoneroBase58(Buffer.from(data, 'hex'));
    }

    /** Custom Base58 encoding (Monero-style) */
    private encodeMoneroBase58(data: Uint8Array): string {
        const fullStr = [];
        const blockSize = 8;
        for (let i = 0; i < data.length; i += blockSize) {
            const block = data.slice(i, i + blockSize);
            fullStr.push(base58.encode(block));
        }
        return fullStr.join("");
    }

    private generateMnemonic(hexStr: string): string {
        const n = this.wordList.length;

        // Convert hex string to Uint8Array
        if (hexStr.length % 8 !== 0) {
            throw new Error("Hex string length must be a multiple of 8 characters (32-bit aligned)");
        }

        const bytes = hexStr.match(/.{8}/g); // Each group is 4 bytes (8 hex chars)
        const words: string[] = [];

        for (const hex of bytes) {
            const leHex = this.helper.hexToLE(hex); // Little-endian
            const x = parseInt(leHex, 16);

            const w1 = x % n;
            const w2 = ((Math.floor(x / n) + w1) % n);
            const w3 = ((Math.floor(x / (n * n)) + w2) % n);

            words.push(this.wordList[w1], this.wordList[w2], this.wordList[w3]);
        }

        const checksumWord = this.computeChecksum(words);
        words.push(checksumWord);

        return words.join(" ");
    }


    private computeChecksum(words: string[]): string {
        if (words.length !== 24) {
            throw new Error("Checksum function requires exactly 24 words");
        }

        // 1. Concatenate first 3 letters of each word
        const concat = words.map(w => w.slice(0, 3)).join("");

        // 2. Compute signed CRC32, then convert to unsigned
        const crcSigned = crc32Str(concat);
        const crc = crcSigned >>> 0;

        // 3. Get index (0–23)
        const idx = crc % 24;

        // 4. Return the checksum word
        return words[idx];
    }
}