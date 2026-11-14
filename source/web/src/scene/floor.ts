import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineSegments,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import { buildGridLines } from './gridLines';
import type { SceneColors } from './sceneColors';
import { SCENE_CONFIG } from './sceneConfig';

const VERTEX_SHADER = /* glsl */ `
attribute float kind;
varying vec2 vFloorXZ;
varying float vKind;
void main() {
  vKind = kind;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vFloorXZ = world.xz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

// The fade is the same smoothstep as `gridFade`, evaluated per pixel against the camera target.
const FRAGMENT_SHADER = /* glsl */ `
uniform vec2 uTarget;
uniform vec3 uMinorColor;
uniform vec3 uMajorColor;
uniform vec3 uMinorFade; // start, end, peak opacity
uniform vec3 uMajorFade;
varying vec2 vFloorXZ;
varying float vKind;
void main() {
  bool major = vKind > 0.5;
  vec3 fade = major ? uMajorFade : uMinorFade;
  float alpha = (1.0 - smoothstep(fade.x, fade.y, distance(vFloorXZ, uTarget))) * fade.z;
  if (alpha <= 0.002) discard;
  gl_FragColor = vec4(major ? uMajorColor : uMinorColor, alpha);
  #include <colorspace_fragment>
}
`;

/**
 * The floor grid at the floor height of the session. 1 m lines are the readable cell, 0.5 m lines a faint
 * subdivision. Both fade with the distance from the camera target, so every line is gone before the grid's edge.
 */
export class Floor {
  readonly group = new Group();
  private readonly geometry = new BufferGeometry();
  private readonly material: ShaderMaterial;
  private readonly target = new Vector2();

  constructor(colors: SceneColors) {
    const { grid } = SCENE_CONFIG;
    const { positions, kinds } = buildGridLines(grid.halfSize, grid.step);
    this.geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute('kind', new Float32BufferAttribute(kinds, 1));
    this.material = new ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uTarget: { value: this.target },
        uMinorColor: { value: colors.gridMinor },
        uMajorColor: { value: colors.gridMajor },
        uMinorFade: { value: new Vector3(grid.minor.start, grid.minor.end, grid.minor.strength) },
        uMajorFade: { value: new Vector3(grid.major.start, grid.major.end, grid.major.strength) },
      },
      transparent: true,
      depthWrite: false,
    });
    const lines = new LineSegments(this.geometry, this.material);
    lines.frustumCulled = false;
    lines.renderOrder = 1;
    this.group.add(lines);
  }

  /** Centers the grid on the camera target and puts it at the floor height. */
  follow(targetX: number, targetZ: number, floorHeight: number): void {
    const { snap } = SCENE_CONFIG.grid;
    this.target.set(targetX, targetZ);
    this.group.position.set(Math.round(targetX / snap) * snap, floorHeight, Math.round(targetZ / snap) * snap);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
