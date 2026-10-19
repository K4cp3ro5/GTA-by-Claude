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
    /* auta NPC: przy ruchu prostopadłym obowiązuje reguła prawej ręki — ustępuje
       ten, kto ma drugie auto po swojej PRAWEJ (inaczej dwa auta na skrzyżowaniu
       widzą się nawzajem "przed sobą" i czekają w nieskończoność). Bezpiecznik:
       po 9 s stania z powodu aut ignorujemy je na 2.5 s (cykl z 4 aut). */
    let blockedByNpc = false, cap = Infinity;     // cap = prędkość auta jadącego przed nami w tym samym kierunku
    if (!block && !(n.ignoreNpcT > 0)){
      for (let k = 0; k < npcs.length; k++){
        if (k === i) continue;
        const m = npcs[k];
        const rx = m.pos.x - n.pos.x, rz = m.pos.y - n.pos.y;
        /* wąski stożek z przodu LUB bardzo bliskie auto przed nosem (zakręty — stożek bywa obrócony) */
        const veryClose = Math.hypot(rx, rz) < 3.0 && (rx*dx + rz*dz) > 0;
        if (!checkPoint(m.pos.x, m.pos.y, 1.0) && !veryClose) continue;
        const mdx = Math.sin(m.heading), mdz = Math.cos(m.heading);
        if (dx*mdx + dz*mdz > 0.8 && (rx*dx + rz*dz) > 5.5){   // to samo kierunek, wystarczający odstęp: dostosuj prędkość
          cap = Math.min(cap, m.speed); continue;
        }
        if (Math.abs(dx*mdx + dz*mdz) < 0.5){
          const rightness = (m.pos.x - n.pos.x) * -dz + (m.pos.y - n.pos.y) * dx;
          if (rightness <= 0) continue;       // drugie auto z lewej — mam pierwszeństwo
        }
        block = true; blockedByNpc = true; break;
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

    n.body.velocity.set(dx * n.speed, 0, dz * n.speed);
    n.body.angularVelocity.set(0, 0, 0);
    n.body.quaternion.setFromAxisAngle(_npAxis, n.heading);
  }
}
