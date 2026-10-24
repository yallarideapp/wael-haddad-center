/* A shallow bonnet shell, photographed in the same camera as the car. */
(() => {
  'use strict';
  const WIDTH = 1672, PHOTO_HEIGHT = 941, HEADROOM = 80, HEIGHT = PHOTO_HEIGHT + HEADROOM;
  const CAMERA = { focal: 2000, x: 836, y: 300, normal: [0, -.970, -.243], distance: -1 };
  const add = (a, b) => a.map((v, i) => v + b[i]);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const scale = (a, n) => a.map((v) => v * n);
  const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const unit = (a) => scale(a, 1 / Math.hypot(...a));
  const mix = (a, b, t) => a.map((v, i) => v * (1-t) + b[i] * t);
  function bezier(points, t) {
    const a = mix(points[0], points[1], t), b = mix(points[1], points[2], t), c = mix(points[2], points[3], t);
    return mix(mix(a, b, t), mix(b, c, t), t);
  }
  // The four curves follow the actual painted bonnet seam in the closed photo.
  const REAR = [[490,307],[656,298],[870,306],[1006,319]];
  const FRONT = [[129,411],[275,433],[443,423],[579,437]];
  const FAR = [[490,307],[323,316],[176,355],[129,411]];
  const NEAR = [[1006,319],[874,325],[719,368],[579,437]];
  function photoPoint(u, v) {
    const rear = bezier(REAR, u), front = bezier(FRONT, u), far = bezier(FAR, v), near = bezier(NEAR, v);
    const bilinear = mix(mix(REAR[0], REAR[3], u), mix(FRONT[0], FRONT[3], u), v);
    return rear.map((n, i) => (1-v)*n + v*front[i] + (1-u)*far[i] + u*near[i] - bilinear[i]);
  }
  function lift(pixel, crown = 0) {
    const ray = [(pixel[0]-CAMERA.x)/CAMERA.focal, (pixel[1]-CAMERA.y)/CAMERA.focal, 1];
    return scale(ray, (CAMERA.distance + crown) / dot(CAMERA.normal, ray));
  }
  function surface(u, v) {
    return lift(photoPoint(u, v), .025 * Math.sin(Math.PI*u) * Math.sin(Math.PI*v));
  }
  function surfaceNormal(u, v) {
    const delta = .0005;
    const du = sub(surface(Math.min(1,u+delta), v), surface(Math.max(0,u-delta), v));
    const dv = sub(surface(u, Math.min(1,v+delta)), surface(u, Math.max(0,v-delta)));
    return unit(cross(dv, du));
  }
  const HINGE = lift(REAR[0]), AXIS = unit(sub(lift(REAR[3]), HINGE));
  function rotate(point, angle) {
    const p = sub(point, HINGE), c = Math.cos(angle), s = Math.sin(angle);
    return add(HINGE, add(add(scale(p,c), scale(cross(AXIS,p),s)), scale(AXIS,dot(AXIS,p)*(1-c))));
  }
  // Leave headroom for the raised bonnet rather than shortening its opening.
  const OPENING = 65 * Math.PI / 180;
  const VERTEX = `
    attribute vec3 a_position;
    attribute vec3 a_normal;
    attribute vec2 a_uv;
    uniform float u_angle;
    uniform vec3 u_hinge;
    uniform vec3 u_axis;
    varying vec2 v_uv;
    varying vec3 v_normal;
    varying vec3 v_position;
    vec3 turn(vec3 p) {
      float c=cos(u_angle), s=sin(u_angle);
      return p*c + cross(u_axis,p)*s + u_axis*dot(u_axis,p)*(1.0-c);
    }
    void main() {
      vec3 p = turn(a_position-u_hinge)+u_hinge;
      vec2 pixel = vec2(2000.0*p.x/p.z+836.0, 2000.0*p.y/p.z+300.0);
      vec2 clip = vec2(pixel.x/1672.0*2.0-1.0, 1.0-(pixel.y+80.0)/1021.0*2.0);
      gl_Position=vec4(clip*p.z, 1.01005025*p.z-.20100503, p.z);
      v_uv=a_uv; v_normal=turn(a_normal); v_position=p;
    }`;
  const FRAGMENT = `
    precision mediump float;
    uniform sampler2D u_texture;
    uniform float u_material;
    uniform vec3 u_color;
    varying vec2 v_uv;
    varying vec3 v_normal;
    varying vec3 v_position;
    void main() {
      vec3 normal=normalize(v_normal);
      vec3 light=normalize(vec3(-.45,-.75,-.55));
      float diffuse=max(0.0,dot(normal,light));
      vec3 color;
      if (u_material<.5) {
        color=texture2D(u_texture,v_uv).rgb;
      } else if (u_material<1.5) {
        vec4 paint=texture2D(u_texture,v_uv);
        color=mix(vec3(.105,.11,.115),paint.rgb,paint.a)*(.84+.16*diffuse);
      } else {
        vec3 view=normalize(-v_position);
        float shine=pow(max(0.0,dot(normal,normalize(light+view))),20.0);
        color=u_color*(.65+.35*diffuse)+vec3(.07)*shine;
      }
      gl_FragColor=vec4(color,1.0);
    }`;

  function create({ canvas, photo, underside }) {
    let gl;
    try { gl = canvas.getContext('webgl', { alpha:true, antialias:true, depth:true, preserveDrawingBuffer:true, powerPreference:'low-power' }); }
    catch (_) { return null; }
    if (!gl || !photo || !underside) return null;
    const resources = { shaders:[], buffers:[], textures:[], program:null };
    let stopped = false, last = null;
    const destroy = () => {
      if (stopped) return;
      stopped = true;
      resources.buffers.forEach((buffer) => gl.deleteBuffer(buffer));
      resources.textures.forEach((texture) => gl.deleteTexture(texture));
      resources.shaders.forEach((shader) => gl.deleteShader(shader));
      if (resources.program) gl.deleteProgram(resources.program);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    };
    try {
      function shader(type, source) {
        const item = gl.createShader(type); resources.shaders.push(item);
        gl.shaderSource(item, source); gl.compileShader(item);
        if (!gl.getShaderParameter(item,gl.COMPILE_STATUS)) throw new Error('Unable to compile bonnet material');
        return item;
      }
      const program = gl.createProgram(); resources.program=program;
      gl.attachShader(program,shader(gl.VERTEX_SHADER,VERTEX));
      gl.attachShader(program,shader(gl.FRAGMENT_SHADER,FRAGMENT));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error('Unable to link bonnet material');
      gl.useProgram(program);
      const attributes = Object.fromEntries(['position','normal','uv'].map((name) => [name,gl.getAttribLocation(program,`a_${name}`)]));
      const uniforms = Object.fromEntries(['angle','hinge','axis','texture','material','color'].map((name) => [name,gl.getUniformLocation(program,`u_${name}`)]));
      gl.uniform3fv(uniforms.hinge,HINGE); gl.uniform3fv(uniforms.axis,AXIS); gl.uniform1i(uniforms.texture,0);
      function texture(image) {
        const item=gl.createTexture(); resources.textures.push(item); gl.bindTexture(gl.TEXTURE_2D,item);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        return item;
      }
      const topTexture=texture(photo), underTexture=texture(underside);
      function mesh(data, dynamic=false) {
        const buffer=gl.createBuffer(); resources.buffers.push(buffer); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),dynamic?gl.DYNAMIC_DRAW:gl.STATIC_DRAW);
        return { buffer, count:data.length/8 };
      }
      function vertex(point, normal, uv) { return [...point,...normal,...uv]; }
      const top=[], bottom=[], rim=[];
      const columns=28, rows=20, vertices=[];
      for (let j=0;j<=rows;j++) for (let i=0;i<=columns;i++) {
        const u=i/columns, v=j/rows, p=surface(u,v), normal=surfaceNormal(u,v), pixel=photoPoint(u,v);
        vertices.push({ top:vertex(p,normal,[pixel[0]/WIDTH,pixel[1]/PHOTO_HEIGHT]),
          bottom:vertex(add(p,scale(normal,-.008)),scale(normal,-1),[u,1-v]), p, normal });
      }
      for (let j=0;j<rows;j++) for (let i=0;i<columns;i++) {
        const a=j*(columns+1)+i, b=a+1, c=a+columns+1, d=c+1;
        [a,c,b,b,c,d].forEach((id) => top.push(...vertices[id].top));
        [a,b,c,b,d,c].forEach((id) => bottom.push(...vertices[id].bottom));
      }
      const border=[];
      for(let i=0;i<=columns;i++) border.push(i);
      for(let j=1;j<=rows;j++) border.push(j*(columns+1)+columns);
      for(let i=columns-1;i>=0;i--) border.push(rows*(columns+1)+i);
      for(let j=rows-1;j>0;j--) border.push(j*(columns+1));
      for(let i=0;i<border.length;i++) {
        const a=vertices[border[i]], b=vertices[border[(i+1)%border.length]], ap=a.p, bp=b.p;
        const aq=add(ap,scale(a.normal,-.008)), bq=add(bp,scale(b.normal,-.008));
        const normal=unit(cross(sub(bp,ap),sub(aq,ap)));
        [ap,aq,bp,bp,aq,bq].forEach((p) => rim.push(...vertex(p,normal,[0,0])));
      }
      const topMesh=mesh(top), underMesh=mesh(bottom), rimMesh=mesh(rim);
      const cylinderMesh=mesh(new Array(8*6*8).fill(0),true), pistonMesh=mesh(new Array(8*6*8).fill(0),true);
      function cylinder(from,to,radius,target) {
        const direction=unit(sub(to,from));
        const tangent=unit(cross(direction,Math.abs(direction[1])<.9?[0,1,0]:[1,0,0]));
        const bitangent=unit(cross(direction,tangent)), data=[];
        for(let i=0;i<8;i++) {
          const a=i*Math.PI/4, b=(i+1)*Math.PI/4;
          const na=add(scale(tangent,Math.cos(a)),scale(bitangent,Math.sin(a)));
          const nb=add(scale(tangent,Math.cos(b)),scale(bitangent,Math.sin(b)));
          const pa=add(from,scale(na,radius)), pb=add(from,scale(nb,radius));
          const qa=add(to,scale(na,radius)), qb=add(to,scale(nb,radius));
          [[pa,na],[qa,na],[pb,nb],[pb,nb],[qa,na],[qb,nb]].forEach(([p,n]) => data.push(...vertex(p,n,[0,0])));
        }
        gl.bindBuffer(gl.ARRAY_BUFFER,target.buffer); gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(data));
      }
      function draw(item,material,image,color,angle) {
        gl.bindBuffer(gl.ARRAY_BUFFER,item.buffer);
        for(const [name,size,offset] of [['position',3,0],['normal',3,12],['uv',2,24]]) {
          gl.enableVertexAttribArray(attributes[name]); gl.vertexAttribPointer(attributes[name],size,gl.FLOAT,false,32,offset);
        }
        gl.uniform1f(uniforms.material,material); gl.uniform1f(uniforms.angle,angle);
        gl.uniform3fv(uniforms.color,color || [0,0,0]); gl.bindTexture(gl.TEXTURE_2D,image || topTexture);
        gl.drawArrays(gl.TRIANGLES,0,item.count);
      }
      canvas.width=WIDTH; canvas.height=HEIGHT;
      gl.viewport(0,0,WIDTH,HEIGHT); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.clearColor(0,0,0,0);
      function render(openness) {
        if(stopped || gl.isContextLost()) return;
        const value=Math.max(0,Math.min(1,Number(openness)||0));
        if(last===value) return;
        last=value;
        const angle=-OPENING*value;
        gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        const lower=lift([858,374],-.07), upper=rotate(surface(.94,.64),angle);
        const length=Math.hypot(...sub(upper,lower)), joint=mix(lower,upper,Math.min(.85,.25/length));
        if(value>.07) {
          cylinder(lower,joint,.009,cylinderMesh); cylinder(joint,upper,.0033,pistonMesh);
          gl.disable(gl.CULL_FACE);
          draw(cylinderMesh,2,null,[.065,.07,.075],0); draw(pistonMesh,2,null,[.55,.59,.62],0);
        }
        gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CCW);
        draw(topMesh,0,topTexture,null,angle); draw(underMesh,1,underTexture,null,angle);
        gl.disable(gl.CULL_FACE); draw(rimMesh,2,null,[.20,.21,.22],angle);
      }
      return { render, destroy };
    } catch (_) { destroy(); return null; }
  }
  window.WHHood = { create };
})();
