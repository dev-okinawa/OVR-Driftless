import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
  Vector2,
} from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import type { SessionInfo } from '../domain/types';
import { areaBrackets } from './areaBrackets';
import type { SceneColors } from './sceneColors';
import { SCENE_CONFIG } from './sceneConfig';

interface Disposable {
  dispose(): void;
}

/**
 * Play-area bounds on the floor. The headset's area is a neutral pad, the Lighthouse area is unfilled; both have a
 * faint edge and corner brackets in the color of their tracking system, so the two differ without color.
 * Rebuilt only when the session changes.
 */
export class PlayAreas {
  readonly group = new Group();
  private readonly disposables: Disposable[] = [];
  private readonly bracketMaterials: LineMaterial[] = [];
  private readonly resolution = new Vector2(1, 1);

  constructor(private readonly colors: SceneColors) {}

  rebuild(session: SessionInfo | null): void {
    this.disposeContent();
    if (!session) return;
    const { areas } = SCENE_CONFIG;
    const y = session.floorHeight + areas.lift;

    for (const area of session.playAreas) {
      if (area.corners.length < 3) continue;

      if (area.trackingSystem === 'headset') {
        // The shape lies in x, z; ShapeGeometry builds it in x, y, so it is turned flat onto the floor.
        const shape = new Shape(area.corners.map((corner) => new Vector2(corner[0], corner[2])));
        const fillGeometry = new ShapeGeometry(shape).rotateX(Math.PI / 2);
        const fillMaterial = new MeshBasicMaterial({
          color: this.colors.shade,
          transparent: true,
          opacity: areas.fillOpacity,
          depthWrite: false,
          side: DoubleSide,
        });
        const fill = new Mesh(fillGeometry, fillMaterial);
        fill.position.y = y;
        fill.renderOrder = 2;
        this.group.add(fill);
        this.disposables.push(fillGeometry, fillMaterial);
      }

      const edgePoints: number[] = [];
      for (const corner of area.corners) edgePoints.push(corner[0], y, corner[2]);
      const edgeGeometry = new BufferGeometry();
      edgeGeometry.setAttribute('position', new Float32BufferAttribute(edgePoints, 3));
      const edgeMaterial = new LineBasicMaterial({
        color: this.colors.shade,
        transparent: true,
        opacity: areas.edgeOpacity,
        depthWrite: false,
      });
      const edge = new LineLoop(edgeGeometry, edgeMaterial);
      edge.frustumCulled = false;
      edge.renderOrder = 3;
      this.group.add(edge);
      this.disposables.push(edgeGeometry, edgeMaterial);

      const bracketGeometry = new LineSegmentsGeometry().setPositions(
        areaBrackets(area.corners, y, areas.bracketLength, areas.bracketMaxFraction),
      );
      const bracketMaterial = new LineMaterial({
        color: this.colors[area.trackingSystem],
        linewidth: areas.bracketWidthPx,
        depthWrite: false,
      });
      bracketMaterial.resolution.copy(this.resolution);
      const brackets = new LineSegments2(bracketGeometry, bracketMaterial);
      brackets.frustumCulled = false;
      brackets.renderOrder = 4;
      this.group.add(brackets);
      this.disposables.push(bracketGeometry, bracketMaterial);
      this.bracketMaterials.push(bracketMaterial);
    }
  }

  /** Fat lines are sized in pixels, so they need the size of the canvas. */
  setResolution(width: number, height: number): void {
    this.resolution.set(width, height);
    for (const material of this.bracketMaterials) material.resolution.copy(this.resolution);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  dispose(): void {
    this.disposeContent();
    this.group.removeFromParent();
  }

  private disposeContent(): void {
    for (const child of [...this.group.children]) this.group.remove(child);
    for (const item of this.disposables) item.dispose();
    this.disposables.length = 0;
    this.bracketMaterials.length = 0;
  }
}
