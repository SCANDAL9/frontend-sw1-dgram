import { Injectable, inject, signal } from '@angular/core';
import { BoardService } from './board.service';
import { ToastService } from '../../../core/services/toast.service';
import { ProjectClass } from '../models/board.model';
import { DiagramService } from './diagram.service';
import { CommandService } from './command.service';

@Injectable({
  providedIn: 'root',
})
export class BoardCatalogService {
  private boardSvc = inject(BoardService);
  private toast: ToastService = inject(ToastService);
  private diagram = inject(DiagramService);
  private cmd = inject(CommandService);

  readonly projectCatalogClasses = signal<ProjectClass[]>([]);
  readonly isLoadingCatalog = signal<boolean>(false);

  loadCatalog(boardId: string): void {
    if (!boardId || boardId === 'default-board') {
      this.projectCatalogClasses.set([]);
      return;
    }
    this.isLoadingCatalog.set(true);
    this.boardSvc.getProjectClasses(boardId).subscribe({
      next: (classes) => {
        this.projectCatalogClasses.set(classes || []);
        this.isLoadingCatalog.set(false);
      },
      error: () => {
        this.isLoadingCatalog.set(false);
      },
    });
  }

  attachClass(boardId: string, cls: ProjectClass, jumpToCanvas: (id: string) => void): void {
    const existing = this.diagram.entities().find((e) => e.id === cls.id || e.name === cls.name);
    if (existing) {
      this.toast.info(`La clase "${cls.name}" ya está presente en este tablero`);
      jumpToCanvas(existing.id);
      return;
    }

    const posX = 120 + (this.diagram.entityCount() % 4) * 35;
    const posY = 120 + (this.diagram.entityCount() % 4) * 35;

    const mappedAttrs = (cls.attributes || []).map((a) => ({
      name: a.name,
      type: a.data_type || 'String',
      pk: a.is_pkey ?? false,
      fk: false,
      nullable: false,
      references: null,
      visibility: a.visibility || '+',
    }));

    if (boardId && boardId !== 'default-board') {
      this.boardSvc.attachClass(boardId, cls.id, { x: posX, y: posY }).subscribe({
        next: () => {
          this.cmd.createEntity(cls.id, cls.name, mappedAttrs, { x: posX, y: posY });
          this.toast.success(`Clase "${cls.name}" vinculada al tablero`);
          this.loadCatalog(boardId);
        },
        error: () => {
          this.cmd.createEntity(cls.id, cls.name, mappedAttrs, { x: posX, y: posY });
          this.toast.info(`Clase "${cls.name}" agregada`);
        },
      });
    } else {
      this.cmd.createEntity(cls.id, cls.name, mappedAttrs, { x: posX, y: posY });
      this.toast.success(`Clase "${cls.name}" agregada`);
    }
  }

  detachClass(boardId: string, entityId: string, onDetached: () => void): void {
    const ent = this.diagram.getEntity(entityId);
    const name = ent?.name || entityId;
    this.cmd.detachEntity(entityId);
    onDetached();

    if (boardId && boardId !== 'default-board') {
      this.boardSvc.detachClass(boardId, entityId).subscribe({
        next: () => {
          this.toast.info(`"${name}" quitada del tablero (disponible en el catálogo)`);
          this.loadCatalog(boardId);
        },
        error: () => {
          this.loadCatalog(boardId);
        },
      });
    } else {
      this.toast.info(`"${name}" quitada del tablero`);
    }
  }

  deleteClassFromModel(boardId: string, entityId: string, onDeleted: () => void): void {
    const ent = this.diagram.getEntity(entityId);
    const name = ent?.name || entityId;
    if (
      !confirm(
        `¿Eliminar definitivamente la clase "${name}" del modelo del proyecto?\n\nEsta acción eliminará la clase de TODOS los tableros y paquetes del proyecto.`
      )
    ) {
      return;
    }
    this.cmd.deleteEntity(entityId);
    onDeleted();

    if (boardId && boardId !== 'default-board') {
      this.boardSvc.deleteClassFromModel(boardId, entityId).subscribe({
        next: () => {
          this.toast.success(`Clase "${name}" eliminada del modelo del proyecto`);
          this.loadCatalog(boardId);
        },
        error: () => {
          this.toast.error(`Error al eliminar "${name}" del modelo`);
          this.loadCatalog(boardId);
        },
      });
    } else {
      this.toast.success(`Clase "${name}" eliminada`);
    }
  }

  deleteCatalogClass(boardId: string, pCls: ProjectClass): void {
    if (
      !confirm(
        `¿Eliminar definitivamente la clase "${pCls.name}" del catálogo del proyecto?\n\nEsta acción la borrará permanentemente de todos los tableros y del modelo.`
      )
    ) {
      return;
    }
    if (boardId && boardId !== 'default-board') {
      this.boardSvc.deleteClassFromModel(boardId, pCls.id).subscribe({
        next: () => {
          this.toast.success(`Clase "${pCls.name}" eliminada del catálogo`);
          const onCanvas = this.diagram
            .entities()
            .find(
              (e) =>
                e.id === pCls.id ||
                e.name.toLowerCase() === pCls.name.toLowerCase()
            );
          if (onCanvas) {
            this.cmd.deleteEntity(onCanvas.id);
          }
          this.loadCatalog(boardId);
        },
        error: () => {
          this.toast.error(`Error al eliminar "${pCls.name}" del catálogo`);
          this.loadCatalog(boardId);
        },
      });
    }
  }
}
