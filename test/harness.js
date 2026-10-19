"use strict";
/* Uniwersalny auto-stub: każdy dostęp do właściwości / wywołanie / "new"
   zwraca kolejny taki sam stub. Pozwala przejść przez cały kod INICJALIZACJI
   (poza petla animate, ktora nie jest wywolywana) bez prawdziwego WebGL,
   lapiac realne ReferenceError / TypeError wynikajace ze zlej kolejnosci
   ladowania plikow, a nie z braku prawdziwej biblioteki. */
function makeStub(name){
  const target = function Stub(){};
  const handler = {
    get(t, prop){
      if (prop === Symbol.toPrimitive) return (hint) => hint === 'number' ? 0 : '';
      if (prop === 'valueOf') return () => 0;
      if (prop === 'toString') return () => '';
      if (prop === Symbol.iterator) return undefined;
      if (prop === 'then') return undefined;
      /* function Stub(){} ma własne length/name/prototype/caller/arguments —
         bez tego wyjątku przeciekałyby jako liczby/stringi zamiast dalszych
         stubów (np. dir.length() rzucałoby "not a function") */
      const ownFnProps = ['length','name','prototype','caller','arguments'];
      if (ownFnProps.indexOf(prop) === -1 && prop in t) return t[prop];
      return makeStub(name + '.' + String(prop));
    },
    set(){ return true; },
    apply(t, thisArg, args){ return makeStub(name + '()'); },
    construct(t, args){ return makeStub('new:' + name); },
    has(){ return true; }
  };
  return new Proxy(target, handler);
}

const fakeLocalStorage = {
  getItem(){ return null; },
  setItem(){},
  removeItem(){}
};

const fs = require('fs');
const vm = require('vm');

const base = {
  THREE: makeStub('THREE'),
  CANNON: makeStub('CANNON'),
  document: makeStub('document'),
  navigator: makeStub('navigator'),
  localStorage: fakeLocalStorage,
  performance: { now: () => Date.now() },
  requestAnimationFrame: function(cb){ base.__frameCb = cb; return 1; },
  cancelAnimationFrame: function(){},
  addEventListener: function(){},
  removeEventListener: function(){},
  innerWidth: 1280,
  innerHeight: 800,
  devicePixelRatio: 1,
  console: console,
  Math: Math, Object: Object, Array: Array, JSON: JSON, Date: Date,
  String: String, Number: Number, Boolean: Boolean, Symbol: Symbol,
  Map: Map, Set: Set, WeakMap: WeakMap, Proxy: Proxy, Reflect: Reflect,
  setTimeout: setTimeout, clearTimeout: clearTimeout, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat
};
/* Proxy nad "window": znane właściwości (base.*) zachowują się naprawdę,
   wszystko inne (nieznane wywołania w stylu window.cokolwiek()) spada na
   generyczny, nierzucający wyjątków stub zamiast TypeError. */
const sandbox = new Proxy(base, {
  get(t, prop){
    if (prop === Symbol.unscopables) return undefined;
    if (prop in t) return t[prop];
    return makeStub('window.' + String(prop));
  },
  has(){ return true; }
});
base.window = sandbox;
base.globalThis = sandbox;
base.self = sandbox;

const order = fs.readFileSync(__dirname + '/../loadorder.txt', 'utf8').trim().split('\n').map(s => s.trim());

/* twardy test zgodności: index.html MUSI ładować dokładnie te pliki, w tej
   samej kolejności, co loadorder.txt — inaczej ten harness testuje coś
   innego niż to, co faktycznie dostaje przeglądarka (tak powstał błąd
   z brakującym highway.js — index.html nie został przebudowany po
   dopisaniu pliku do loadorder.txt). */
const htmlContent = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const htmlScripts = Array.from(htmlContent.matchAll(/<script src="js\/([^"]+)"><\/script>/g)).map(m => m[1]);
const same = htmlScripts.length === order.length && htmlScripts.every((f, i) => f === order[i]);
if (!same) {
  console.error('BŁĄD: index.html NIE zgadza się z loadorder.txt!');
  console.error('  loadorder.txt:', order);
  console.error('  index.html:   ', htmlScripts);
  process.exit(1);
}
console.log('index.html zgodny z loadorder.txt (' + order.length + ' plików) — OK');

let code = '';
for (const f of order){
  code += '\n//=== ' + f + ' ===\n';
  code += fs.readFileSync(__dirname + '/../js/' + f.trim(), 'utf8');
}

try {
  // uruchamiamy jako skrypt najwyzszego poziomu (nie funkcje), tak jak w <script> w przegladarce
  const script = new vm.Script(code, { filename: 'concat-game.js' });
  const ctx = vm.createContext(base);
  script.runInContext(ctx);
  console.log('WYKONANIE OK — cały kod inicjalizacyjny przeszedł bez ReferenceError/TypeError.');
  if (typeof base.__frameCb === 'function'){
    try {
      base.__frameCb(16.6);
      console.log('Jedno wywołanie pętli animate() też przeszło bez ReferenceError/TypeError.');
    } catch (e2) {
      console.error('BŁĄD w pętli animate():', e2.message);
      console.error(e2.stack.split('\n').slice(0,6).join('\n'));
      process.exit(1);
    }
  } else {
    console.log('UWAGA: requestAnimationFrame nie zostało wywołane z callbackiem — nie sprawdzono animate().');
  }
} catch (e) {
  console.error('BŁĄD WYKONANIA:', e.message);
  console.error(e.stack.split('\n').slice(0,6).join('\n'));
  process.exit(1);
}
