// The forged models are DFO's, whole, so this layer must build DFO's shapes to the bit, and only bytes show that.
// Each hash is what DFO's own Building Forge, Prop Forge or Room Kit builds from the same table: a building from
// every stretch of the table and every kind of wing, a prop of every family, and pieces of the kit with doors,
// slopes and the big rooms; but not a building's windows, which are the game's own, 2 m wide and their frame alone,
// and left out where a lower wing's gable stands in the wall as where a door does. It covers the positions, normals,
// UVs and indices as bytes, then the parts. A deliberate change to a shape re-pins its hash.
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import type { ForgedModel } from './model.ts';
import { buildingModel, withoutDoors } from './buildings.ts';
import { propModel } from './props.ts';
import { kitModel } from './roomKit.ts';
import { buildingTable, kitTable, propTable } from './fixtures.test.ts';

function modelHash(model: ForgedModel): string {
  const hash = createHash('sha256');
  for (const array of [model.positions, model.normals, model.uvs, model.indices])
    hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
  hash.update(JSON.stringify(model.parts.map((part) => [part.archive, part.record, part.start, part.count])));
  return hash.digest('hex');
}

const PINNED: Record<'buildings' | 'buildingsWithoutDoors' | 'props' | 'kit', Record<number, string>> = {
  buildings: {
    107: '10e54aadd007abc2afbf60ec1a3c70aee60c7e6865bdfff35feb60a2b8e5256c',
    109: 'b98ff9acc0666912c341c6ad67fd61b2bb7286b7ddce811bfc0b492140958453',
    110: 'a0ec92c46f0303bfdd02c1c1ba2ee3e64ce40a624619962a7bf8ee291fb4a85a',
    120: '8b46c5f4d988feb72be15d56ade78d16b837e9ab30337dfa1c63429339e36a0f',
    125: '0c688d78d0a0dacb3de0456feafb926e24dd0187ce1e8e45c6e2b76a5df9adda',
    133: '4ddf4ac50777e414da368db2a7cf3e87c697040c7a1ca6e596a4107c1d36747f',
    146: '5c8ceb95fa4b2444204ff546bccd19214a0e8acba8ff31218fa53b91f5464739',
    159: '541a38ba08eb8b128112686ee9fe717331ee0ed0f514469e60a3aa62744bd0c5',
    208: '2c84e7d0923aff5a9c377022218dc462167a01ffe7e90c853c2b6c669b2bcfed',
    224: 'ad7de1fa1bbf234127b10de9667e524a52c5e415bac9183cc983d8a9656312b8',
    240: '1e09adedc361028bfc4e7ea9315e354173e5722caab7e071e9c56ca374585471',
    253: 'b660beecc2881a2258d126a6698272346a4eb49eafce246b3c0aabde29c34dff',
    314: 'ee5adca2e8829bc76224e64af0fcfbff8068ae86f4f5b401efee70731c9fa924',
    317: '7bbd77db2ac6b7cffddf1c57ca0d59e621517c6e5dd6891e0371dc7c76236dc9',
    330: 'db965482e651ce8d9533125d31bebf44b012d05011b5b97cdeed58d1b1d375fd',
    345: 'd950c952813251627167c5991d7e3b2be26bdf57ff4092b355d9e243ed4e61c8',
    402: '8e45e72538626653d9f6c13c63ffb696d8fde05b7450da161594423e7a4d224b',
    417: 'e8195bf2ec688c4f73691b3c82474b3b4689c3d3c40e4e595151e0b50f0bf7c7',
    439: '005682cb25fbefd96b753c52fd3f6bb49a76b358f3e39435c51bb02c472ff7b4',
    444: '7f51466df652df2b3aef64ddad83fd9fc8eabbdc084af46743ce68c8f90c94b1',
    445: 'd1088a4ecb4b7048c04d61cc77b72189ab4f9e8ac4dceb34c50e712488df6ccc',
    446: 'f729de56579775e815ecab74c9c636f7cb2a0622cf21f72158c15c51dfa6936a',
    448: 'b4cc2d63c592a7e13fede61422aa3f80e8dec3251d1520ec9cf3e21d8ea600ab',
    451: '14fee864bd13c95746c78849e7eb029bc2850451ad05640be56fc2aaf4a6ab3c',
    458: '2e29d15392492f51566f2c8e8a4d303f981780fab0a2b8faccb732e65fb71555',
    520: '3ed629f36d7d39f56a2aba8f77b2d2cf3ca34e8f19f1a65178880968ea91f819',
    521: 'aa87c283c4ab9fc052e85ed52fe794f51d2f49af76f48207073909cd0b46ba5e',
    522: '8403f9aad5dbe8717e9dbc838663dc8c8360e5934ceab3cd2d41971fec52ca59',
    533: 'd708eabf45fa965053edde8ffb8d6c7afb8bb85ffc7f7318b92ba7fa74d8c7ba',
    546: 'a14df6ef733ee59f022d8a1020cc83260016793184651572a61c7ded5602e1e1',
    561: '6c9d9dec5aa426c3bf0316074998061b700d4f935decc657bf9ee10994cf94c5',
    610: 'c5b13aa7324b34754e4071fd8552be0e5adfbebba3d0bb56103ca3a0d5f9f1d2',
    626: '1822917e9f2d92077f02066df78176e18ea82ecb53404b6f52621b31c3937599',
    645: 'df2d3af1d972744f22a6b5b846683057b5b1207723c1acac48a177980b40cf44',
    658: 'db1dc9e33654bcbc66b4d8b42670492c2133fb0f9f0c34602caed2eececa91ef',
    708: 'f5e8ce92b694551ffbd90e3d71ba7a5fdad8556b2bc0e75277a6600042a10fe4',
    721: '3921a72cd348ea6f455a17e2ff032ff6442f88085ae2f53cc67224707927ae02',
    744: '0375d3adddec5f03f09d0c0838300c3ee8771762eb42ac15f8923a23ec344291',
    758: '40cc570f6d1460835d94a82c11ac37d61451e8ff08575ce68bc2031965bbbc6a',
    847: '4029fcd0d8dcc3d708d65fa222fa38a76bf7a393dd353572b280673b3089b7ca',
    862: '0718cb5faaf4130019d38dfb48a461e1dfe3b8dd9466a193412d1705d980f89d',
    909: 'cef781ca5a4e63d8b59d66d28ebd0fa3f5198d9170f97f20330c0730f57057e4',
  },
  buildingsWithoutDoors: {
    444: 'fff1caedbaa2866a66341162255b64ce255ddb08cc37f9105493a85a0244a6bb',
    445: '12391ad8b2ced472c93f5255cc1ef4bfff85bef300cd805afd5b82784908f962',
    446: '9ae5f4ec00f4cb33ae3211c23699e5f2b5756a2c5e0fed681a7e00dfdfac1bde',
    107: '4f38f743f4904959dbc6a754c0ba7fa797a9d45a0abae4bc67e02d3b60beb6e9',
  },
  props: {
    5103: '865ed32312d8e52bdf412a2d6ad9038e4650ae37e731d63a27b0da90bc5ac982',
    6101: '3293055efd4dc3f8d196723660a982f530e62b7cbda3f0c8226b3dce4e0619b2',
    6308: '20c88f9c36c2aa873581075f6ae5f4fd9eef6b8e9e11fa85b4ef526c197dfff6',
    40012: '13c8f04b9dc5f2e4e4846f273b97f86505d2e2e2a3c011c652ed86c6594f60de',
    41000: 'aac931a77058a3174658b04a67675e44e06a2087d08e2b5be913427bbe81bf6a',
    41002: 'e061bd0511f2e5ccee8ae7e461cc681c34f52e13c0a5756c1a0b321657f89e99',
    41003: 'dfd18b7a4840868b759f445409952e56c281ae3a6f0bee4b64fa9a6690a0071e',
    41005: '3f347ccb06be3cd30ccbd0e3c616a8e9b12b05a2ac4ebb7733fd0a4580326e03',
    41007: 'b7d7b280db29778785d292e396f07022ba581e6eea9199f798ffbdb3d2a96367',
    41009: '455410e64d95999903e7ff4b7211b06c4e2d38b6d74e790e2a3bbf3c48129e6d',
    41020: '241a3cf83152d821f27aa7ac5c4c867f2adfdb173d03e6f6a8b1597b79c38718',
    41021: 'ce2984d09c37a998c14162d56cb7590d037491ca039017f0ed0f728dcf3dca0f',
    41032: '0eb37e681cbefbc8a9f0ebce75452f75161a9ce02396abe0ec91803f3722875c',
    41033: '3a8ce8b21d5619877847fae3093c01b9186ab233e11d7e9908a66553fb8473d7',
    41035: 'ea1d903b2b89b020e0ed1fc3a471dd42654ac31def75af481e6ee0a0d651adde',
    41100: '0b5bcdad19a0659ccfb59fe317161e597665de3035bfa93616a3246e3220103c',
    41105: 'b9431d76155820b7b6ef5fe7961d7226bf4006981edc94a700d607cdbf019c5e',
    41108: 'c3808d44c62b8e6eef2ee972a9a6ae97cde34ebe82d3c741c4bdeb46d046e6e8',
    41115: '99abadd16ba4ef7e4470b37f432f1f11959f0e249fdc11bc9accea389a65d746',
    41116: '1351ab97c778f7d54ccc2c0f7ca958ce190dd53caadd2e208e89a0aa162821d9',
    41120: 'a66ed106186ad9ca3d7d18d6e5f4617ccc3e8241a5152b75e82f3496d055a892',
    41126: 'dac90f7be0d2604ada23a73b11d7d22e144cfece562a83d915a11c0710c73078',
    41127: 'fe45edc47da35d19e4f1a647930eb86568beb1a066a5181305ee27d10995af98',
    41200: 'a6b5efe27fe47d6df0ee83a0cf10417095df9b76c0e00e9a44d27ad9811ec191',
    41206: '69e2c358e912cad5a5e8e22448582633557379373c621e096ec060fcaa2da5a6',
    41209: 'e7e36fc22320ab23cea5c0eef0fe781c213a2e391f7d16539343ed02b246cf2a',
    41214: '0e395592b5b64af6f7595acfbef767121ad2f9027721e89b9484f28b32f164e8',
    41216: '57ac59b6ad92ecd32d46585254e8532aaf1fc95e7755ea9d9f1f8e0502a6d7e1',
    41220: 'f5cfa7a078e1b4250861488ce58c9640561b70d988e709ec36a5a66fef8a9663',
    41402: '8c57b4d30e38a0ca9675ed9ff747b3093faaee3f63e1b5fce8af0e02bf4edbac',
    41409: '207a492b8eecf0706b52e293d6d0462c0c0b39ac5b5702588b4525fc70c16b44',
    41508: '46b2c921aecfe83830206200349b1c91a8f32d6bb2af7480b2f787abc8c5926e',
    41700: '408eaf2c49285f1891a7604246ed636ec30170badb74ff0c237aad2ec729ebf1',
    41702: '817ca4b9baf63d4b928ad6f23c81bfd3404e0ac5405e83f30595c51b23310767',
    41704: '7c84f769b62c7d7fed6ea91d1c033ed4c23fc37398ed11d25ae9e8aacc72e97a',
    41720: 'eb54bdf85b8756a53f89329a0d4ee0de6f308fc37737b2832469cae56f8ffb73',
    41722: 'e5a2942701a6427f86c6118bd8e29f43ba148f6e3fe29e70a7c1822ce761041e',
    41723: 'af3e6923285d25b837e892ea058420de4ddd1673521193753d8c3bf7b38fb4f8',
    41726: '3186935ab6f18679f2667c68ac6cb76dd20c87b4a11647e7dbfc65cafd943860',
    41739: '9a277b90b5a52a230e56c4332d25b867b05ee96d3cd44c28f88a6b2e1b356374',
    41816: '8736ccb6240634a9e6b9a928809131ec7009bd558128474a694a3255b4f87fb0',
    41901: '0b2e40e8e04726df72bae942cc67957508378b4c14ea5b341e6bd2313b0e5b50',
    42000: '79c41f417a872a1610329c311b2ef08b31ec599524a1c1768f8c364c8539de40',
    42001: '08d29238933e190074e05f5122c49cf7e803131223e96f5c4307beabe7ab487a',
    43003: '130de0a45b35fb82f7983925baf5dac491f454960b7e8fb53a4cc999a371887f',
    43007: 'ef571c57bc30f94c77db5dde220555d94e282ac241290acb7b28e9b3eaf58ae9',
    43011: '52d797df92e312674a3fa6095b02752ab8ae403a032c9dd9a0f03407d86fe663',
    43027: 'fca2e67ed1022e79389cd6160a3411d55090ca49cd290513d7424909b44b676c',
    43055: '895ce8931e4872a0a793db2427fcdd3e615f44555a30cd254920bade0920c635',
    43071: '9c96167475798cbf84c5d4a828d77046d10925919a40bf103b2faf10088441f1',
    43075: '7f4e4107ca328cac6bcd4c41d950bbb84599ff1726611a68b8696ef7717d9ffd',
    43079: '703d70fc279f1bf82682b2737ebb5e74b7c0d6c8dc340004f3074aeabd33a55a',
    43083: '124b8158158154f881047c9f2cc57f0e1dfaa0870d5ab533b45bd073922071e4',
    43109: 'b9c2e9fece7958a97a847486c72569873a6ca835ea9e48bd9ba12da0c9647347',
    43113: '130babb493b3b668b27e7fa94815192bcb545dc98eb0283612f52549d7e04fb9',
    43137: '7bdc4bf7b151df4771908b060fd1c80ee7296d6e165ae8b0d6afa03331e9bd55',
    43200: '2d874b26bff87467b60be193360a9927fc526d2464dc51171acb0179ea906b73',
    // Not DFO's: the well house's posts carry its ridge, where DFO's stop at the eaves.
    43202: '2f1d45850b8735397d8a9e71a24bd907783a85b96dd2d167b4fa4160db9c6123',
    43307: '7226984d34b8ee0a2039ade4da8ea778a08a2cc72835c50fbaf0262d39f2cafe',
    43600: '7d901c39d6729df05b64880c8c1e704ea647ca676c423ebda5a4757ff31a10b6',
    43702: '7cf13aa9e271a1c66ce4fe7ed3bf7b3670c6afe8b92779d99d8d92a60c22dc3d',
    43737: 'cc5896334d9579d83069ab737abd987de8de97bbc7f69e285730624d5bed0b98',
    51115: 'ed5474b16a4971a26dd5102d981d8b39870266af2ecb10ba0f80a52a1c18f697',
    62310: '20c547baf8c715d1ed1b84743048e6eea9302c90d9cb3a601006b6351347798d',
    62324: 'd02d9fd7eb3e67bc9f6a9a426f6c22b0c05711ba924b18725a932c97389f23fb',
  },
  kit: {
    1000: '131a65b025d6357a028cf3ea3169a400d84dddd84dad395fbe31092450d429e3',
    2007: 'a03f90f122576c253be0d5179b41399e2d7bf93a9fd1b8a8532e20ab19c5c4d8',
    3002: 'c51b43960948f91b1ce368589a44f4f16a7cd21b41e5fcb4a8f8f10d8ff66089',
    3030: '852cdf8eaebab3a1f165908ee0f7acae2543557287602b027db0bd5709058689',
    3430: 'e06ee2224ae052c3a7ea9509007ffaf1b55cc08af80ca475b44d28397d5d19b8',
    4702: 'feb824b9afdf530fc0155f60ac4051d00cb053351bf6869f521ddb73ff5574ff',
    8513: '2dd70cb4613ba9da7a0e4f4c09aa04dcb7558205bd315b51977c03c06272b68b',
    11000: 'b6aab3117d89b67843dfdaa1084a2b0bf964fa1725f65f6ec1aa2ccbc635da62',
    11405: 'a65a8179dd6f3cdd6d10e25b0c864cc631cb553951c5812ea31745c83a0dd624',
    14808: 'a91a9a25f76d174256fab41da3928cf5f5ef46d402e86e94a60eb11db6648721',
    15713: 'a1e7856272715481ab2c3b916453ce98efea9ae41a0a5f9d66846574b16fa153',
    20020: 'e91a8e67e9d0e04653d6a7746dbf68c7bb073e5992ff3e07aefa3875d74f8267',
    28308: '0274746abee89186d46d5b039125c5694910e889392428eafb9e2bd6980624cb',
    31006: '3f65795a6474b958de3cf5edc2b7e7c81986cf86c4c9f9035c8a7a2ef778a9a5',
    31031: '6e399142fe2c437b0da9e8afb071c75e8c7d184cb1af77e0b9e2e1f6dd4d7b32',
    31300: 'a0796f2a792f96cb1970a27c47ea52d266b1f45bd884e1b0bf87e02dd12afd73',
    31429: 'aad0a45192ad38dcfd6df1858134062e7907a69f3965b34096faf78ebae98546',
    31720: '639e4b64be28ecc7799eb93bb246946292c04826f001e73ebfd2ff5db39fa1bd',
    34500: '0521979893bcbc4437a634b1a4f9c9cc2a222f34a40f8fb56575eb03adcf4ccf',
    44016: 'bb03344e5c28989d771d88dadeb747554a73b812ba8067d916539878c42abcce',
  },
};

const hashesOf = (pinned: Record<number, string>, build: (id: number) => ForgedModel | null): Record<number, string> =>
  Object.fromEntries(
    Object.keys(pinned).map((id) => {
      const model = build(Number(id));
      return [id, model ? modelHash(model) : 'no model'];
    }),
  );

test("a building is DFO's to the bit, with its doors and without", () => {
  assert.deepEqual(
    hashesOf(PINNED.buildings, (id) => buildingModel(buildingTable, id)),
    PINNED.buildings,
  );
  assert.deepEqual(
    hashesOf(PINNED.buildingsWithoutDoors, (id) => {
      const model = buildingModel(buildingTable, id);
      return model && withoutDoors(model);
    }),
    PINNED.buildingsWithoutDoors,
  );
});

test("a prop of every family is DFO's to the bit", () => {
  assert.deepEqual(
    hashesOf(PINNED.props, (id) => propModel(propTable, id)),
    PINNED.props,
  );
});

test("a piece of the rooms' kit is DFO's to the bit", () => {
  assert.deepEqual(
    hashesOf(PINNED.kit, (id) => kitModel(kitTable, id)),
    PINNED.kit,
  );
});
