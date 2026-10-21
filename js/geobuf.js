/* ---------------------------------------------------------------
   5. BUFOR GEOMETRII (scalanie brył w jedną siatkę)
   --------------------------------------------------------------- */
function GeoBuf(){ this.p = []; this.n = []; this.u = []; }
GeoBuf.prototype.quad = function(a,b,c,d, ua,ub,uc,ud){
  const e1x = b[0]-a[0], e1y = b[1]-a[1], e1z = b[2]-a[2];
  const e2x = d[0]-a[0], e2y = d[1]-a[1], e2z = d[2]-a[2];
  let nx = e1y*e2z - e1z*e2y, ny = e1z*e2x - e1x*e2z, nz = e1x*e2y - e1y*e2x;
  const len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
  nx /= len; ny /= len; nz /= len;
  this.p.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2],
              a[0],a[1],a[2], c[0],c[1],c[2], d[0],d[1],d[2]);
  for (let i = 0; i < 6; i++) this.n.push(nx,ny,nz);
  this.u.push(ua[0],ua[1], ub[0],ub[1], uc[0],uc[1],
              ua[0],ua[1], uc[0],uc[1], ud[0],ud[1]);
};
/* trójkąt; normalna = (b−a)×(c−a) */
GeoBuf.prototype.tri = function(a,b,c, ua,ub,uc){
  const e1x = b[0]-a[0], e1y = b[1]-a[1], e1z = b[2]-a[2];
  const e2x = c[0]-a[0], e2y = c[1]-a[1], e2z = c[2]-a[2];
  let nx = e1y*e2z - e1z*e2y, ny = e1z*e2x - e1x*e2z, nz = e1x*e2y - e1y*e2x;
  const len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
  nx /= len; ny /= len; nz /= len;
  this.p.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2]);
  for (let i = 0; i < 3; i++) this.n.push(nx,ny,nz);
  this.u.push(ua[0],ua[1], ub[0],ub[1], uc[0],uc[1]);
};
/* prostokąt poziomy (normalna +Y) */
GeoBuf.prototype.plane = function(cx, y, cz, sx, sz, uw, uh){
  const hx = sx/2, hz = sz/2;
  this.quad([cx-hx,y,cz+hz],[cx+hx,y,cz+hz],[cx+hx,y,cz-hz],[cx-hx,y,cz-hz],
            [0,0],[uw,0],[uw,uh],[0,uh]);
};
/* okrągła nakładka pozioma (normalna +Y) — wachlarz trójkątów, nie kwadrat;
   kolejność wierzchołków sprawdzona numerycznie (quad(center,p1,p0,p0) daje normalną (0,1,0)) */
GeoBuf.prototype.disc = function(cx, y, cz, R, seg){
  for (let s = 0; s < seg; s++){
    const a0 = s/seg*TAU, a1 = (s+1)/seg*TAU;
    const p0 = [cx+Math.cos(a0)*R, y, cz+Math.sin(a0)*R];
    const p1 = [cx+Math.cos(a1)*R, y, cz+Math.sin(a1)*R];
    const uv0 = [0.5+Math.cos(a0)*0.5, 0.5+Math.sin(a0)*0.5];
    const uv1 = [0.5+Math.cos(a1)*0.5, 0.5+Math.sin(a1)*0.5];
    this.quad([cx,y,cz], p1, p0, p0, [0.5,0.5], uv1, uv0, uv0);
  }
};
/* płaski pierścień (linia ustąpienia pierwszeństwa na rondzie itp.) —
   kolejność wierzchołków sprawdzona numerycznie (quad(pI0,pI1,pO1,pO0) -> normalna w górę) */
GeoBuf.prototype.ring = function(cx, y, cz, rInner, rOuter, seg){
  for (let s = 0; s < seg; s++){
    const a0 = s/seg*TAU, a1 = (s+1)/seg*TAU;
    const pI0 = [cx+Math.cos(a0)*rInner, y, cz+Math.sin(a0)*rInner];
    const pI1 = [cx+Math.cos(a1)*rInner, y, cz+Math.sin(a1)*rInner];
    const pO0 = [cx+Math.cos(a0)*rOuter, y, cz+Math.sin(a0)*rOuter];
    const pO1 = [cx+Math.cos(a1)*rOuter, y, cz+Math.sin(a1)*rOuter];
    this.quad(pI0, pI1, pO1, pO0, [0,0],[1,0],[1,1],[0,1]);
  }
};
/* pudełko bez spodu; uS = jednostek świata na kafel */
GeoBuf.prototype.box = function(cx, cy, cz, w, h, d, uS, withTop){
  const hx = w/2, hy = h/2, hz = d/2;
  const x0 = cx-hx, x1 = cx+hx, y0 = cy-hy, y1 = cy+hy, z0 = cz-hz, z1 = cz+hz;
  const uw = w/uS, ud = d/uS, uh = h/uS;
  this.quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1], [0,0],[uw,0],[uw,uh],[0,uh]); // +Z
  this.quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0], [0,0],[uw,0],[uw,uh],[0,uh]); // -Z
  this.quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1], [0,0],[ud,0],[ud,uh],[0,uh]); // +X
  this.quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0], [0,0],[ud,0],[ud,uh],[0,uh]); // -X
  if (withTop)
    this.quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0], [0,0],[uw,0],[uw,ud],[0,ud]);
};
GeoBuf.prototype.geometry = function(){
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
  g.setAttribute('normal',   new THREE.Float32BufferAttribute(this.n, 3));
  g.setAttribute('uv',       new THREE.Float32BufferAttribute(this.u, 2));
  g.computeBoundingSphere();
  return g;
};
GeoBuf.prototype.empty = function(){ return this.p.length === 0; };
/* jak .box(), ale obrócone wokół Y o rotY — ta sama konwencja co
   CANNON.Quaternion.setFromAxisAngle((0,1,0), rotY), sprawdzone numerycznie */
GeoBuf.prototype.boxRot = function(cx, cy, cz, w, h, d, rotY, uS, withTop){
  const hx = w/2, hy = h/2, hz = d/2;
  const cs = Math.cos(rotY), sn = Math.sin(rotY);
  const rot = (lx, lz) => [cx + lx*cs + lz*sn, cz - lx*sn + lz*cs];
  const y0 = cy - hy, y1 = cy + hy;
  const p00 = rot(-hx,-hz), p10 = rot(hx,-hz), p11 = rot(hx,hz), p01 = rot(-hx,hz);
  const uw = w/uS, ud = d/uS, uh = h/uS;
  this.quad([p01[0],y0,p01[1]],[p11[0],y0,p11[1]],[p11[0],y1,p11[1]],[p01[0],y1,p01[1]], [0,0],[uw,0],[uw,uh],[0,uh]);
  this.quad([p10[0],y0,p10[1]],[p00[0],y0,p00[1]],[p00[0],y1,p00[1]],[p10[0],y1,p10[1]], [0,0],[uw,0],[uw,uh],[0,uh]);
  this.quad([p11[0],y0,p11[1]],[p10[0],y0,p10[1]],[p10[0],y1,p10[1]],[p11[0],y1,p11[1]], [0,0],[ud,0],[ud,uh],[0,uh]);
  this.quad([p00[0],y0,p00[1]],[p01[0],y0,p01[1]],[p01[0],y1,p01[1]],[p00[0],y1,p00[1]], [0,0],[ud,0],[ud,uh],[0,uh]);
  if (withTop)
    this.quad([p01[0],y1,p01[1]],[p11[0],y1,p11[1]],[p10[0],y1,p10[1]],[p00[0],y1,p00[1]], [0,0],[uw,0],[uw,ud],[0,ud]);
};
/* czworokąt z automatycznie poprawnym zwrotem normalnej (w stronę "out") */
function quadOut(buf, a, b, c, d, out){
  const e1 = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], e2 = [d[0]-a[0], d[1]-a[1], d[2]-a[2]];
  const nx = e1[1]*e2[2]-e1[2]*e2[1], ny = e1[2]*e2[0]-e1[0]*e2[2], nz = e1[0]*e2[1]-e1[1]*e2[0];
  if (nx*out[0] + ny*out[1] + nz*out[2] < 0) buf.quad(a, d, c, b, [0,0],[0,1],[1,1],[1,0]);
  else buf.quad(a, b, c, d, [0,0],[1,0],[1,1],[0,1]);
}
/* scalenie kilku prostych brył Three.js (BoxGeometry, CylinderGeometry…) w jedną geometrię
   z kolorami wierzchołków — jedna siatka = jedno wywołanie rysowania zamiast kilkunastu.
   parts: [{ geo, color, x, y, z, rx? }] (geo nie jest modyfikowane) */
const _mcM = new THREE.Matrix4(), _mcE = new THREE.Euler(), _mcC = new THREE.Color();
function mergeColored(parts){
  const P = [], N = [], C = [];
  for (const pt of parts){
    const g = (pt.geo.index ? pt.geo.toNonIndexed() : pt.geo.clone());
    _mcE.set(pt.rx || 0, pt.ry || 0, pt.rz || 0);
    _mcM.makeRotationFromEuler(_mcE).setPosition(pt.x || 0, pt.y || 0, pt.z || 0);
    g.applyMatrix4(_mcM);
    _mcC.setHex(pt.color);
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++){ P.push(p[i]); N.push(n[i]); }
    if (pt.colorFn){                                    // kolor na trójkąt wg środka (w układzie modelu): okna, pasy malowania na bryle
      const step = pt.quads ? 18 : 9;                 // quads: kolejne pary trójkątów to czworokąt (LatheGeometry) — jeden kolor, równe krawędzie okien
      for (let i = 0; i < p.length; i += step){
        const e = Math.min(p.length, i + step), nv = (e - i) / 3; let cx = 0, cy = 0, cz = 0;
        for (let k = i; k < e; k += 3){ cx += p[k]; cy += p[k+1]; cz += p[k+2]; }
        const h = pt.colorFn(cx / nv, cy / nv, cz / nv);
        _mcC.setHex(h === undefined || h === null ? pt.color : h);
        for (let k = 0; k < nv; k++) C.push(_mcC.r, _mcC.g, _mcC.b);
      }
    } else for (let i = 0; i < p.length / 3; i++) C.push(_mcC.r, _mcC.g, _mcC.b);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal',   new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute('color',    new THREE.Float32BufferAttribute(C, 3));
  out.computeBoundingSphere();
  return out;
}
/* trójkąt z normalną zwróconą w stronę "out" */
function triOut(buf, a, b, c, out){
  const e1 = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], e2 = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
  const nx = e1[1]*e2[2]-e1[2]*e2[1], ny = e1[2]*e2[0]-e1[0]*e2[2], nz = e1[0]*e2[1]-e1[1]*e2[0];
  if (nx*out[0] + ny*out[1] + nz*out[2] < 0) buf.tri(a, c, b, [0,0],[0.5,0.4],[1,0]);
  else buf.tri(a, b, c, [0,0],[1,0],[0.5,0.4]);
}

/* wiele buforów jednokolorowych -> jedna geometria z atrybutem color: pairs = [[GeoBuf, 0xRRGGBB], ...] */
function mergeColoredGeometry(pairs){
  let n = 0; pairs.forEach(p => { n += p[0].p.length; });
  if (!n) return null;
  const pos = new Float32Array(n), nor = new Float32Array(n), col = new Float32Array(n);
  let o = 0;
  pairs.forEach(p => {
    const b = p[0], c = new THREE.Color(p[1]);
    pos.set(b.p, o); nor.set(b.n, o);
    for (let i = 0; i < b.p.length; i += 3){ col[o + i] = c.r; col[o + i + 1] = c.g; col[o + i + 2] = c.b; }
    o += b.p.length;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
