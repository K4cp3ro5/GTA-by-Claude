# CLAUDE.md — GTA by Claude

Przeglądarkowe mini-GTA 3D: Three.js r128 + cannon.js 0.6.2 (UMD z cdnjs; nie cannon-es — ESM nie działa z `file://`).
Wszystko proceduralne (tekstury z `<canvas>`, modele z prymitywów, dźwięk z Web Audio). Gra działa po otwarciu `index.html`.

## Uruchomienie i testy
- `npm install` — instaluje `cannon@0.6.2` dla testu jazdy.
- `npm test` = `node test/harness.js` (ładuje wszystkie skrypty w Node z atrapami, sprawdza zgodność `index.html` z `loadorder.txt`, jedna klatka `frame`) + `node test/sim.js 300`.
- `node test/sim.js <s>` (env `SEED=…`) — prawdziwa logika NPC i pieszych w Node: nakładanie aut (SAT, tylko |Δy| < 2,5), zakleszczenia, ronda, piesi, przepisy (limity, jednokierunkowe), kontrole statyczne (normalne buforów, znaki, autostrady: filary, prześwit, przęsła).
- `npm run test:drive` (`test/drive.js`, ~4 min) — prawdziwy RaycastVehicle z cannon: przejazdy A1/A2, pętla, łącznica, zjazdy, ulica pod estakadą, bariera, kolizje (drzewo, słupek, mur), ronda.
- `npm run bundle` — skleja grę w jeden plik HTML.
- Zmiany wizualne sprawdzaj zrzutami Playwright (chromium + swiftshader, CDN podmieniony przez `page.route` na lokalne three/cannon, czekanie aż `#go` nie jest `disabled`). Geometrię i kolizje sprawdzaj liczbowo.

## Architektura
Brak bundlera: `index.html` ładuje zwykłe `<script>` w kolejności z `loadorder.txt` (harness sprawdza zgodność). Wszystkie pliki dzielą jeden zakres globalny; kod wykonywany przy starcie może używać tylko symboli z plików wcześniejszych.

| plik | rola |
|---|---|
| core.js | narzędzia (`rnd` = `mulberry32(GAME_SEED)`, `lerp`, `clamp`…), stałe świata, renderer, scena, kamera, światła |
| hwy-plan.js | czysta geometria autostrad: osie, drogi (`HWY_WAYS`), filary, rampy, zapytania przestrzenne, punkty tras NPC |
| textures.js | tekstury proceduralne |
| geobuf.js | `GeoBuf` (scalanie brył: `quad`, `quadOut`, `triOut`, `box`…) |
| physics-world.js | świat cannon, materiały, statyczne kolizje w komórkach, poprawka `computeAABB` |
| signs.js | znaki drogowe: tarcze, słupki, `placeSign`, `signSpotFree` |
| city-generation.js | ulice, chodniki, przejścia, ronda, dzielnice, budynki, domki, parki, pas podmiejski, mur |
| highways.js | budowa autostrad z planu: pomosty, nasypy, bariery, filary, latarnie, znaki |
| traffic-lights.js | sygnalizacja 2-fazowa na wybranych skrzyżowaniach |
| road-rules.js | limity (`speedLimitAt`), droga z pierwszeństwem (`PRIO`), jednokierunkowa obwodnica, ich znaki |
| city-props.js | detale (InstancedMesh): latarnie, drzewa, kosze, hydranty |
| player.js / vehicle.js | postać gracza / prowadzalne auto (`chassisBody`, `vehicle`, `carModel`) |
| traffic-npc.js | trasy NPC (`LOOPS`, `HWY_LOOPS`), modele i spawn aut NPC |
| pedestrians.js | piesi NPC, przejścia |
| weapons.js | broń, koło broni (Q) |
| controls.js | klawisze (przebindowywalne, localStorage), mysz, menu |
| sound.js | synteza dźwięku |
| vehicle-entry.js | wsiadanie, wysiadanie, kradzież, atrapa głównego auta |
| daynight.js | cykl dobowy |
| update-player.js / update-vehicle.js / update-npc.js | logika na klatkę |
| camera.js / hud.js | kamera TPP / HUD, minimapa, mapa |
| main-loop.js | pętla `frame` i start |

Klatka (`main-loop.js`): `updateSky` → `updateTrafficLights` → `updateNpcs` → `updatePedestrians` → `updateCar` → `updatePlayer` → `physicsStep` (akumulator 1/60, maks. 2 kroki, porzuca zaległość) → interpolacja modeli (`_p0/_q0`, `alpha`) → `syncCar` → kamera → HUD → render. Teleport ciała = `noLerp`.

## Układ świata
- Siatka 12×12: oś ulicy `L(i) = −264 + 44i`, `blockCenter(i) = L(i) + 22`, `ROAD_H = 7` (pół jezdni), `LOT = 30` (działka), `WALK_H = 0.25`.
- `CITY_EDGE = 271`, pas podmiejski `BELT = 125`, mur `WALL_X = 397.5`.
- Kurs h → kierunek (sin h, cos h); północ = −Z, wschód = +X; ruch prawostronny.
- Autostrady: A1 na x = z, A2 na x = −z, pomost 7 m (A2 nad węzłem 14 m). Parametry w `HP`. Jezdnie `CW['A1+']` itd., węzeł koniczynowy w (0,0), terminale `HWY_TERM` w 4 narożnikach (0 SE, 1 SW, 2 NW, 3 NE). Budynki i detale omijają pas autostrady (`hwyCovered`, `hwyRectCovered`).

## Fizyka
- Statyczne kolizje idą do złożonych ciał-komórek 48 m (`staticShape`, `staticBox`, `staticBoxQ`) — tysiące osobnych ciał zabijały wydajność.
- `fixComputeAABB` (physics-world.js) poprawia błąd cannon 0.6.2 w AABB obróconych kształtów. **Nie usuwać** — bez tego koła przepadają przez pomost.
- Jedno prowadzalne auto (`chassisBody`) reprezentuje główne albo skradzione auto; zaparkowane auto to atrapa (statyczne ciało + model).
- Domyślny `collisionFilterMask` w cannon to 1 — ustawiaj `-1`. Grupy: G_WORLD 1, G_PLAYER 2, G_CAR 4, G_PED 8.
- Fizyczny przód auta gracza to lokalne −Z (kwaternion = kurs + π); model NPC jedzie w lokalne +Z.

## NPC
- Trasy to zamknięte pętle punktów `{x, z, y?, vmax?, hwy?, rk?}`. Ciało kinematyczne prowadzone prędkością; `n.y` i pochylenie interpolowane między punktami.
- `npcConflict`: kolejka i rozstrzyganie skrzyżowań wg czasu dojazdu (ETA), tie-break po `id`; ignoruje auta na innym poziomie (|Δy| > 2,5).
- Przepisy miejskie (światła, STOP, ronda z `RB.commit`, piesi, zebry, `speedLimitAt`, pierwszeństwo) tylko na poziomie ulic; na autostradzie limit z `vmax` punktu.

## Pułapki
- `core.autocrlf=true`: pliki w repo mają CRLF po checkoutcie; przed porównaniami tekstu normalizuj `\r\n`.
- `GeoBuf.quad`: normalna = (b−a)×(d−a); poziome powierzchnie muszą patrzeć w górę (sim.js to sprawdza).
- Raycasty z `skipBackfaces: true`.
- Znaki stawiaj przez `placeSign` po sprawdzeniu `signSpotFree`; na autostradach przez `hwySignAt`.
- Nowy plik JS: dopisz do `loadorder.txt` i `index.html` w tej samej kolejności.
