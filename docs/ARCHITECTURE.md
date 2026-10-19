# GTA by Claude (dawniej Nocturne City) — architektura kodu (pełny opis)

Gra: przeglądarkowe mini-GTA 3D. Three.js r128 + cannon.js 0.6.2 z CDN (cdnjs, UMD; NIE cannon-es — ESM nie działa z file://).
Brak bundlera: `index.html` ładuje 23 zwykłe `<script>` kolejno wg `loadorder.txt`. Wszystkie pliki dzielą JEDEN
globalny zakres (top-level `const/let/function` z jednego pliku widać w następnych). Kolejność = zależności:
używanie symbolu z pliku ładowanego PÓŹNIEJ w kodzie wykonywanym przy starcie = ReferenceError (TDZ). Funkcje
wywoływane dopiero w pętli (`frame`) mogą odwoływać się do dowolnego pliku.
Wszystko proceduralne: tekstury z `<canvas>`, modele z prymitywów, dźwięk z Web Audio (zero assetów).

## Przepływ startu i pętla
1. `core.js` sprawdza biblioteki (`errBox`), definiuje narzędzia, stałe świata, renderer/scena/kamera/światła.
2. `textures`, `geobuf`, `physics-world` → `city-generation` buduje miasto (scalone siatki) → `highway` → `traffic-lights`
   → `city-props` (instancing) → `player`, `vehicle`, `traffic-npc` (spawnuje NPC i wywołuje `initHighwayTraffic()` +
   `initRoundaboutTraffic()`), `pedestrians`, `weapons`, `controls`, `sound`, `vehicle-entry`, `daynight`, `update-*`,
   `camera`, `hud`, `main-loop` (start).
3. `main-loop.js frame(now)`: updateSky → updateTrafficLights → updateNpcs → updateHighwayTraffic →
   updateRoundaboutTraffic → updatePedestrians → updateCar → (tryb pieszy + pointerLocked) updatePlayer →
   Weapons.updatePose → updateWheel → `world.step(1/60, dt, 3)` → syncCar → updateCamera → updateLampLights →
   updateHud → render. Tryby: globalna `mode` = `'foot'` | `'car'`.

## Konwencje i pułapki (czytaj przed edycją)
- Heading h → kierunek świata `(sin h, cos h)`. Północ = −Z, wschód = +X. Ruch PRAWOSTRONNY. Prawa strona kierowcy jadącego
  w kierunku f=(fx,fz) to `(−fz, fx)`.
- Model auta NPC jedzie w lokalne +Z. Fizyczny przód auta gracza (RaycastVehicle) to lokalne −Z → `carYaw()+PI` przy
  ustawianiu quaternionu. `CAR_FWD`/`CAR_LEFT` w vehicle-entry.js.
- Siatka: `L(i) = -HALF + i*BLOCK` (oś ulicy i), `blockCenter(i)`. GRID=12, BLOCK=44, ROAD_W=14 (ROAD_H=7), LOT=30,
  HALF=264, WALL_X=272.5, WALK_H=0.25 (krawężnik). Skrzyżowania (i,j), i,j ∈ 0..12. Kwartały (bi,bj) ∈ 0..11.
- `GeoBuf.quad(a,b,c,d,uv…)`: normalna = (b−a)×(d−a) i to ona decyduje o widoczności (FrontSide). Poziome ściany muszą mieć
  normalną W GÓRĘ — inaczej niewidoczne z góry (był taki błąd: jezdnie autostrady). Poprawne: `plane()`, `disc()`, `ring()`,
  `box()`, `quadOut()` (wybiera nawinięcie wg zadanej normalnej). `test/sim.js` sprawdza normalne buforów dróg.
- cannon.js 0.6.2: domyślne `collisionFilterMask = 1` → wszędzie ustawiamy `-1` (inaczej brak kolizji; to był błąd „brak podłogi”).
  Grupy: G_WORLD=1, G_PLAYER=2, G_CAR=4, G_PED=8. `Cylinder` ma oś lokalną Z → `staticCylinder` obraca o −π/2 wokół X.
  `RaycastVehicle`: indexRightAxis 0, UpAxis 1, ForwardAxis 2; `setSteeringValue(+)` = w lewo.
  `SAPBroadphase` źle znosi nieskończony `Plane` w testach — w harnessach użyj dużego Boxa.
- Nigdy nie zmieniaj `quaternion` ciał kinematycznych NPC bez `body.position` (NPC jedzie przez ustawianie `velocity`
  w `updateNpcs`; autostradowe i rondowe auta ustawiają pozycję bezpośrednio).
- Statyczną geometrię dodawaj do GeoBuf-ów i scalaj (`addMerged`), nie twórz tysięcy Mesh. Powtarzalne detale → `instance()`
  (city-props.js). `camBlockers` = siatki, z którymi kolizjuje raycast kamery.

## Pliki — co robią i najważniejsze symbole
### core.js
Narzędzia: `mulberry32`, `rnd/rand/randInt/pick/clamp/lerp/damp/smoothstep/approach/wrapAngle/angleDamp`, `addBody/delBody`.
Stałe świata (patrz wyżej), `signLog` (rejestr znaków; diagnostyka w sim.js), `approachSpot(cx,cz,d,along,lateral)` (miejsce znaku
po prawej kierowcy + obrót przodem do niego), `mapExtras` (dodatki do minimapy: rect/disc/line), `HWY_X=WALL_X+45`,
`HWY_IC_Z=L(6)` (węzeł), `HWY2_Z=L(2)` (ulica pod estakadą), `WORLD_X1=HWY_X+135` (wschodnia granica świata).
`renderer` (shadowMap PCFSoft), `scene` (FogExp2), `camera` (66°, far 900), `hemi`, `sun` (DirectionalLight), `lampLights`.
### textures.js
`mkCanvas`, `toTex`, `noiseOver`, `texAsphalt/texRoad/texCross/texCrossStrip/texWalk/texCurb/texRoof`, `texFacade(cfg)` (okna;
nocą świecą). Wszystko z canvas 2D.
### geobuf.js
`GeoBuf` (p/n/u): `quad`, `plane`, `disc`, `ring`, `box`, `boxRot`, `geometry()`, `empty()`.
### physics-world.js
`world` (grawitacja −20, SAP, solver 9 iter.), materiały `matGround/matCar/matPlayer` + ContactMaterial, `groundBody` (Plane),
`staticBox`, `staticBoxRot`, `staticCylinder`.
### city-generation.js
Bufory: `roadBuf, crossBuf, crosswalkBuf, roundaboutPaintBuf, walkBuf, curbBuf, roofBuf, facadeBufs[]` + `texs`, `FACADES`
(pule fasad), `facadeMats`. Ziemia: plane 960×960 z asfaltem (y=−0.02).
Ulice: dla każdej linii siatki odcinki jezdni (`roadBuf`), skrzyżowania (`crossBuf`), przejścia dla pieszych (`crosswalkStrip`,
55% prawdopodobieństwa na każdej krawędzi, nie na rondach). `ROUNDABOUT_PTS=[[4,4],[8,4],[4,8],[8,8]]`.
Dzielnice: centrum (wieżowce 34–92 m), handlowa (wzdłuż arterii), przemysłowa (zachód, hale), mieszkalna; `addBuilding(cx,cz,w,d,h,pool,yBase)`
(fasada + dach + attyka + `staticBox` + wpis do `buildings` dla minimapy/sim). `SPECIAL_CORNERS`: 4 place narożne (tri/round)
+ 8 parków (`buildParkBlock`, `buildCornerPlaza`), `PARKING_BLOCKS` (`buildParkingBlock`), przystanki (`buildBusStop`).
Listy detali: `lampSpots, treeSpots, binSpots, hydSpots`, `pedBlockCandidates` (kwartały z chodnikiem → pętle pieszych).
Mur: `barrier()` — JEDEN obwód: x∈[−WALL_X, WORLD_X1], z=±WALL_X.
Ronda: `buildRoundaboutIsland` (wyspa R=2.2 z kolizją, pierścień farby 5.0–5.4), `roundaboutCars` + `initRoundaboutTraffic`
(po 1 aucie na rondzie, r=3.8, ~0.4 rad/s) + `updateRoundaboutTraffic` (a += speed·dt → przeciwnie do wskazówek),
`roundaboutYield(px,pz,dx,dz)` (NPC dojeżdżające ustępują). Znaki: `texC12/c12Tex/buildC12`, `buildA7`; stawiane `approachSpot`
na 4 wlotach każdego ronda. `addMerged(buf,mat,cast,receive)` + siatki `roadMesh, crossMesh, …, facadeMeshes`; `camBlockers`.
### highway.js
Autostrada N–S przy x=HWY_X, wewnątrz muru, ruch prawostronny: jezdnia A (zachodnia, `HWY_A_OUT..HWY_A_IN`) jedzie na +Z,
B (wschodnia, `HWY_B_IN..HWY_B_OUT`) na −Z; 2 pasy po 3.5 m + pobocze 2.5 + pas rozdziału 4 m (blok z kolizją).
`HWY_Z0/Z1=±(WALL_X−0.6)`, kończy się w tunelach (`HWY_TUN_L=16`: dach + ściany boczne + strop) przy murze N/S; auta zawijają się
przy |z|>`HWY_WRAP`. Estakada `HWY_BR={zc:HWY2_Z,half:13,ramp:78,h:5.0}`, profil `hwyH(z)`, `hwySlope(z)`, odcinki `HWY_ZS`;
rampy = lity nasyp (`tiltBox` grubości max(y)+0.3), pomost = płyta 0.7 + filary; `slopeWall`, `embankSide`, `quadOut`, `tiltBox`.
Łącznice: `HWY_OFF_RAMP` (z jezdni A w prawo do skrzyżowania (12,6)), `HWY_ON_RAMP` (z powrotem na A), krzywe Beziera
`bezPt/bezTan`, `buildRamp(p0,p1,p2,w,seg,taperStart,taperEnd)`, `rampSignSpot`. Ulica pod estakadą + plac z zawrotką (`YARD_X`) + hale;
strefa wschodnia (`buildEastZone`): droga serwisowa, 2 kolumny hal, drzewa. Znaki autostrady (`texHwySign`, `buildSignPost`).
Ruch: `hwyTraffic` (12 aut, 6/jezdnię), `spawnHighwayCar`, `hwyLaneX(side,lane)` (lane 0=prawy/wolny, 1=lewy), `hwyGap/hwyLead/hwyLaneFree`,
`updateHighwayTraffic` (vDes 22–42 m/s, odstęp, wyprzedzanie lewym pasem, powrót na prawy, podąża za `hwyH`).
Pushuje `mapExtras` (jezdnie, łącznice, plac, hale) dla minimapy.
### traffic-lights.js
`TL_PTS=[[3,3],[9,3],[6,9]]`, cykl 9 s + 1.4 s „wszystkie czerwone”, `buildSignalHead`, `updateTrafficLights`, `redLightAhead(px,pz,dx,dz)`.
STOP (`STOP_PTS`, `stopSigns`, `texStop`, `buildDiscSign`, `stopSignAhead(n,dx,dz,dt)` — hamuje, stoi ~1.4 s, `stopPass`),
B-33 (`texSpeed`): tylko oznakowanie. Wszystkie znaki przez `approachSpot`/`rampSignSpot`.
### city-props.js
`instance(geo,mat,list,fill,cast,receive)`, `setTRS`, materiały; instancing latarni (+ szkło/poświata/żarówki), drzew (A/B), koszy,
hydrantów. `lampGlows`, `lampBulbs` sterowane przez `updateLampLights` (daynight.js).
### player.js
`player` {body (2 sfery r=0.4 → kapsuła), mesh, health, stamina, grounded…}, `buildHumanoid(pal)` (low-poly, współdzielony z pieszymi),
`SPAWN`, `checkGrounded` (raycast).
### vehicle.js
`buildCarModel(paintHex)` (sedan: karoseria, szyby, felgi, światła, SpotLight reflektorów), `carModel.paintMat`. `chassisBody`
(masa 1250, Box 0.96×0.35×2.16), `RaycastVehicle` (4 koła, `WHEEL_OPT`: stiffness 40, frictionSlip 3.4, rollInfluence 0.03…),
`REAR_GRIP` (drift przy hamulcu ręcznym).
### traffic-npc.js
`NPC_COLORS`, `npcs`, `npcLoop(i0,j0,i1,j1)` (prostokątna pętla przesunięta o 3.5 m od osi, prawy pas), `LOOPS` (9 pętli ×2 auta),
`buildNpcModel`, `spawnNpcCar(path,color,startIdx)` (kinematyczne ciało; `target` = prędkość strefowa × 0.7–1.35), `spawnRandomNpcCar`, `removeNpcCar`.
### update-npc.js
`updateNpcs`: kierunek do `path[wp]`; przeszkody (gracz-auto, gracz pieszo, inne NPC w stożku 11 m); reguła prawej ręki dla ruchu
prostopadłego + bezpiecznik cierpliwości (9 s → ignoruj 2.5 s); jazda za wolniejszym autem (`cap`) zamiast stop-and-go;
`redLightAhead`, `stopSignAhead`, `roundaboutYield`; płynne `damp` prędkości; ustawia `body.velocity`.
### pedestrians.js
`Pedestrians.list`, `spawnPed(bi,bj)`, `updatePedestrians`, `removePed`; piesi krążą po pętli wokół kwartału (`pedLoopFor`), humanoidy z `PED_PALETTES`,
reagują na trafienia (`Sound.hurt`). NIE używają przejść dla pieszych (do zrobienia).
### weapons.js
`WEAPON_DEFS`: Pięści (melee 14), Kij (30), Pistolet (ranged, zasięg 42, mag 12). `Weapons` (sloty 1–3, strzał raycastem, cooldown, przeładowanie,
poza ręki `updatePose`), `buildPistolMesh/buildBatMesh`, koło broni (Q, canvas: `drawWheel/updateWheel`).
### controls.js
`keys`, `pointerLocked`, `camYaw`, `mode`, `DEFAULT_BINDS` (WASD, Shift, Space, F wsiądź/wysiądź/ukradnij (+E), H klakson, R przeładuj, Q koło,
1–3 sloty, T przyspiesz dobę, M wycisz), `BIND` zapisywane w `localStorage['nc_binds_v1']`, menu sterowania (rebind), ekran startowy `gate`,
Pointer Lock. Menu debug (klawisz `` ` ``): liczba aut/pieszych (+/−/usuń), czas doby (suwak/zamrożenie), uzdrów, amunicja, god mode,
teleport, mnożnik prędkości auta (`carSpeedMult`), liczniki ciał/FPS. Zmienne: `godMode`, `timeFrozen`.
### sound.js
`Sound` (Web Audio, czysta synteza): `init, engine(rpm…), horn, step, shoot, swing, reload, hurt, thud`.
### vehicle-entry.js
Wsiadanie/wysiadanie/kradzież: `nearestVehicle` (auto gracza lub NPC < 3.5 j. od drzwi), `toggleVehicle`, `jackCar(n)` — ukradzione NPC znika
(spawn nowego), gracz dostaje jego kolor/pozycję; poprzednie „główne” auto zostaje jako atrapa (`mainCarPlaceholder`); kolejna kradzież
despawnuje poprzednio ukradzione; `returnToMainCar`, `drivingIdentity` ('main'|'jacked'), `carYaw()`, `resetCar()` (R: postaw na kołach).
### daynight.js
`timeOfDay` 0..1 (DAY_LENGTH=300 s), `updateSky` (słońce, kolory nieba/mgły, hemi, lampy wł. nocą), `updateLampLights` (SpotLight tylko dla
najbliższych latarni), `dayF/nightF/duskF`.
### update-player.js
`updatePlayer` (WASD względem kamery, sprint+stamina, skok, upadki → obrażenia), `damagePlayer`, `respawnPlayer`.
### update-vehicle.js
`updateCar` (MAX_STEER 0.52, MAX_FORCE 5200, BRAKE_F 62, HAND_F 190, opór 1.15·v², steer wraca do centrum, mniejszy kąt przy prędkości,
`carSpeedMult`), `syncCar` (model ↔ ciało).
### camera.js
`updateCamera(dt,kmh)`: TPP spring-arm z raycastem po `camBlockers`, kamera pościgowa w aucie z lerp i FOV zależnym od prędkości.
### hud.js
Elementy `el`, minimapa całego świata: `mapStatic` (rysowane raz: jezdnie, kwartały, budynki, osie, `mapExtras`, mur), `drawMinimap`
(NPC, auto, pieszy, stożek kamery — wzory obrotu sprawdzone numerycznie), `updateHud` (prędkościomierz, zegar/faza doby, zdrowie/kondycja, broń).
### main-loop.js
`frame`, stały krok fizyki 1/60, start (`renderer.compile`, `syncCar`, `requestAnimationFrame(frame)`).

## HTML
`index.html`: CSS + elementy HUD (id: speedo, kmh, minimap, healthfill, staminafill, weaponhud, debugMenu, gate, settings…) + skrypty.
`node test/bundle.js out.html` skleja wszystko do jednego pliku.
