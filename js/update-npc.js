/* ---------------------------------------------------------------
   18. NPC
   --------------------------------------------------------------- */
const _npAxis = new CANNON.Vec3(0, 1, 0);
function updateNpcs(dt){
  for (let i = 0; i < npcs.length; i++){
    const n = npcs[i];

    /* ciało kinematyczne jest źródłem prawdy — model i logika idą za nim */
    n.pos.set(n.body.position.x, n.body.position.z);
    n.mesh.position.set(n.pos.x, 0, n.pos.y);
    n.mesh.rotation.y = n.heading;

    const tgt = n.path[n.wp];
    let dx = tgt.x - n.pos.x, dz = tgt.z - n.pos.y;
    let d = Math.hypot(dx, dz);
    if (d < 2.2){
      n.wp = (n.wp + 1) % n.path.length;
      continue;
    }
    dx /= d; dz /= d;

    /* detekcja przeszkody przed maską */
    let block = false;
    const checkPoint = (px, pz, radius) => {
      const ox = px - n.pos.x, oz = pz - n.pos.y;
      const ahead = ox * dx + oz * dz;
      if (ahead < 0.5 || ahead > 11) return false;
      const lat = Math.abs(ox * -dz + oz * dx);
      return lat < 2.0 + radius;
    };
    if (checkPoint(chassisBody.position.x, chassisBody.position.z, 1.0)) block = true;
    if (!block && mode === 'foot' &&
        checkPoint(player.body.position.x, player.body.position.z, 0.5)) block = true;
    if (!block && mainCarPlaceholder &&
        checkPoint(mainCarPlaceholder.body.position.x, mainCarPlaceholder.body.position.z, 1.0)) block = true;   // zaparkowane główne auto
    /* auta NPC (npcConflict): jazda za autem w tym samym kierunku (cap), a przy ruchu poprzecznym
       punkt kolizji torów — auto, które już jest w strefie konfliktu, ma pierwszeństwo; gdy oba
       dopiero dojeżdżają, ustępuje to, które ma drugie po PRAWEJ (reguła prawej ręki). Bezpiecznik:
       po 9 s stania z powodu aut przez 2.5 s liczy się tylko auto tuż przed maską. */
    let blockedByNpc = false, cap = Infinity;     // cap = prędkość auta jadącego przed nami w tym samym kierunku
    if (!block){
      const ignoring = n.ignoreNpcT > 0;
      for (let k = 0; k < npcs.length; k++){
        if (k === i) continue;
        const r = npcConflict(n, npcs[k], dx, dz, ignoring);
        if (r === true){ block = true; blockedByNpc = true; break; }
        if (r < cap) cap = r;
      }
    }
    if (n.ignoreNpcT > 0) n.ignoreNpcT -= dt;
    n.waitT = (blockedByNpc && n.speed < 0.3) ? (n.waitT || 0) + dt : 0;
    if (n.waitT > 9){ n.ignoreNpcT = 2.5; n.waitT = 0; }
    if (!block && redLightAhead(n.pos.x, n.pos.y, dx, dz)) block = true;
    if (!block && stopSignAhead(n, dx, dz, dt)) block = true;
    if (!block && roundaboutYield(n.pos.x, n.pos.y, dx, dz)) block = true;
    n.blocked = block;

    const want = block ? 0 : Math.min(n.target, cap);
    n.speed = damp(n.speed, want, (block || want < n.speed - 1) ? 5.5 : 1.7, dt);
    n.heading = angleDamp(n.heading, Math.atan2(dx, dz), 5.5, dt);

    n.dirX = dx; n.dirZ = dz;
    n.body.velocity.set(dx * n.speed, 0, dz * n.speed);
    n.body.angularVelocity.set(0, 0, 0);
    n.body.quaternion.setFromAxisAngle(_npAxis, n.heading);
  }
}

/* Relacja auta n (kierunek jazdy dx,dz) z autem m: true = stój, liczba = maks. prędkość
   (jazda za m), Infinity = brak wpływu. Kierunek m to jego faktyczny kierunek jazdy (dirX/dirZ),
   nie wygładzony heading — w zakręcie heading spóźnia się za ruchem. */
function npcConflict(n, m, dx, dz, onlyClose){
  const rx = m.pos.x - n.pos.x, rz = m.pos.y - n.pos.y, dist = Math.hypot(rx, rz);
  if (dist > 16) return Infinity;
  const ahead = rx*dx + rz*dz, lat = Math.abs(rx*-dz + rz*dx);
  if (dist < 3.2 && ahead > 0) return true;                        // tuż przed maską — zawsze stop
  if (onlyClose) return Infinity;
  const mdx = m.dirX !== undefined ? m.dirX : Math.sin(m.heading), mdz = m.dirZ !== undefined ? m.dirZ : Math.cos(m.heading);
  const dot = dx*mdx + dz*mdz;
  if (dot > 0.8){                                                  // ten sam kierunek: kolejka
    if (ahead < 0.5 || ahead > 13 || lat > 2.6) return Infinity;
    if (ahead < 5.5) return true;
    return ahead < 8 ? m.speed * 0.7 : m.speed;
  }
  if (dot < -0.8){                                                 // z naprzeciwka: tylko gdy na moim pasie
    return (ahead > 0.5 && ahead < 10 && lat < 2.2) ? true : Infinity;
  }
  /* ruch poprzeczny: punkt przecięcia torów; t = moja droga do niego, s = droga m (ujemna = minął) */
  const cr = dx*mdz - dz*mdx;
  const t = (rx*mdz - rz*mdx) / cr, s = (rx*dz - rz*dx) / cr;
  if (t < -2.6 || t > 13 || s < -2.6 || s > 13) return Infinity;   // któreś już minęło punkt (tył auta też) albo jest daleko
  const mIn = s < 3.2, nIn = t < 3.2;                              // w strefie konfliktu (lub tuż przed nią)
  if (nIn && !mIn) return Infinity;                                // jestem już w środku — jadę dalej
  if (mIn && !nIn) return true;                                    // ono jest w środku — czekam
  if (mIn && nIn) return t > s ? true : Infinity;                  // oba w środku: dalsze od punktu ustępuje
  if (m.speed < 0.5) return Infinity;                              // m stoi przed skrzyżowaniem (światło, STOP, ustępuje) — nie czekam na nie
  const rightness = rx*-dz + rz*dx;                                // > 0: m po mojej prawej
  return (rightness > 0 && t < 12) ? true : Infinity;
}
