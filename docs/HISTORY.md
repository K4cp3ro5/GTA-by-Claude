# Historia projektu i decyzje (z rozmowy z użytkownikiem)

Użytkownik: Polak (pisz po polsku), iteracyjnie rozwija grę, testuje ręcznie i wysyła listę poprawek. Prosi o małe zużycie tokenów,
„nie pomyl się”, i po większej pracy o krótki opis zmian + uczciwe ograniczenia.

## Oś czasu żądań
1. Oryginał: jednoplikowy `index.html` — mini-GTA (Three.js r128 + cannon-es), siatka 8×8, budynki z oknami, latarnie/drzewa, postać TPP
   z pointer-lock, auto (RaycastVehicle, drift), wsiadanie [F]/[E], NPC auto po pętli, cykl dnia i nocy, HUD+minimapa, dźwięk Web Audio,
   zero zewnętrznych assetów, bez skrótów. (cannon-es zamieniono na cannon.js 0.6.2 UMD — ESM nie ładuje się z file://.)
2. „Napraw podłogę, kolizji nie ma” → `collisionFilterMask=-1`.
3. Ekwipunek jak GTA V (pięści/kij/pistolet, koło broni), prawdziwe menu z przebindowywaniem sterowania, piesi na chodnikach, większe miasto
   z trójkątami i rondami jako granicą, kradzież aut NPC, health/stamina bar, naprawa kierunku stożka widzenia na minimapie w aucie.
4. Ronda nie były okrągłe (kwadraty zamiast kół) → `GeoBuf.disc`; po kradzieży auta NPC kolor gracza się zmieniał → przebudowa logiki
   tożsamości auta (`drivingIdentity`, atrapa głównego auta, despawn poprzednio ukradzionego).
5. Menu debug (liczba aut, czas, zatrzymanie czasu, usuwanie NPC/aut, mnożnik prędkości auta, god mode, teleport…), przejścia dla pieszych nie na
   każdym skrzyżowaniu, poprawa modelu kija, ronda „jak prawdziwe”.
6. Duży prompt „Przebudowa mapy i systemu drogowego” (plik w uploads): duże nieregularne miasto, polskie ronda (C-12, A-7), światła i znaki
   wpływające na NPC, autostrada z węzłem/estakadą/tunelami, AI NPC przestrzegające przepisów, wydajność, wieloplikowy kod, testy.
   Użytkownik zgodził się na wiele plików; na start: autostrada + jeden węzeł.
7. Ostatnia lista poprawek (wykonana): znaki rond na środku ulicy; NPC objeżdżają rondo w złą stronę; autostrada poza murami (brak ciągłości);
   estakada z przezroczystą jezdnią; zróżnicowane prędkości NPC (szybciej na autostradzie).
   Do tego znaleziony i naprawiony przeze mnie ruch LEWOSTRONNY na autostradzie.

## Błędy znalezione i ich przyczyny (nie powtarzać)
- Brak kolizji świata: domyślny mask=1 w cannon 0.6.2.
- Odwrócony stożek minimapy: zły wzór obrotu; poprawny `rotate(-yaw+PI)` dla znaczników, `rotate(-camYaw)` dla stożka.
- Cylindry leżały poziomo (oś Z) → obrót −π/2 wokół X.
- Ronda-kwadraty: `plane` zamiast `disc`; wyspa R=2.6 kolidowała z pasem NPC (offset 3.5, pół szerokości auta 0.95) → R=2.2.
- index.html nie przebudowany po dodaniu pliku → harness sprawdza zgodność z loadorder.
- NPC autostradowe „pod prąd”: trasy tam-i-z-powrotem; naprawa: stały kierunek na pas + zawijanie.
- Zakleszczenia NPC (STOP, ustępowanie na rondzie, skrzyżowania parami) → reguła prawej ręki + bezpiecznik cierpliwości; 30 min symulacji bez zakleszczeń.
- Jezdnie autostrady/łącznic/estakady były niewidoczne z góry: kolejność wierzchołków quada dawała normalną w dół (widać było tylko podłoże).
- Rampy estakady miały tylko cienką płytę → można było wjechać pod nasyp z boku; teraz lity nasyp.
- Ronda krążyły w złą stronę (`c.a -=`); poprawnie `c.a +=` i heading `a+PI/2`.
- Znaki stawiane „w osi” zamiast przy prawej krawędzi → `approachSpot`.
- Autostrada miała ruch lewostronny → odwrócone kierunki jezdni i łącznic.
- `YARD_X` w TDZ (użyty przed deklaracją) → kolejność bloków w highway.js ma znaczenie.
- Środowisko wielokrotnie się resetowało i traciło pracę → TRZYMAJ KOD W GIT-cie i commituj często.

## Co jest zrobione vs. czego brakuje
Zrobione: patrz README.md (sekcja „Co jest w grze”). Brakuje (kolejne kroki, w tej kolejności sensownej):
1. Prawdziwe ronda: większa wyspa (np. R≈4–5), pas okrężny, wloty/wyloty z wysepkami, trasy NPC po łukach przez rondo (dziś NPC mijają rondo prosto).
2. Nieregularna, ręcznie zaprojektowana sieć ulic zamiast siatki ortogonalnej (przepisać generator, trasy NPC — najlepiej graf węzłów/odcinków,
   minimapę, węzeł autostrady).
3. Wielopoziomowy węzeł autostradowy, więcej estakad/tuneli; NPC miejscy wjeżdżający na autostradę przez łącznice.
4. Egzekwowanie B-33, znaki zakazu wjazdu/nakazu kierunku/drogi podporządkowanej, piesi przechodzący przez przejścia.
5. Wydajność: LOD / ograniczenie AI NPC daleko od gracza przy większej mapie.
6. Drobne: ostrzeżenia `flatShading` na MeshLambertMaterial (city-props.js), sporadyczne nakładania aut NPC (~1/75 s w sim).
