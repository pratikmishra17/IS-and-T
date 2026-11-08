import { Directive, ElementRef, Injectable, computed, inject, input, output, signal } from '@angular/core';
import { Task } from '../services/tasks';

/**
 * Drag a task onto a person to give it to them, using the browser's own drag and drop:
 *   <button [appTaskDrag]="task">…</button>                       a task you can pick up
 *   <div [appTaskDrop]="student.id" (taskDropped)="give($event)">  a person's row (null = the Unassigned row)
 * While a task is being dragged, every row it could go to gets a dashed outline (.drop-ready),
 * and the row under the pointer fills in (.drop-over). Only open tasks (unassigned or assigned)
 * can be moved; finished and cancelled ones stay put.
 */

/** The task being dragged right now, shared by the task and the rows. */
@Injectable({ providedIn: 'root' })
export class TaskDragging {
  readonly task = signal<Task | null>(null);
}

/** Only tasks still to do can change hands. */
export function canReassign(task: Task): boolean {
  return task.status === 'UNASSIGNED' || task.status === 'ASSIGNED';
}

@Directive({
  selector: '[appTaskDrag]',
  host: {
    '[attr.draggable]': 'movable() ? "true" : null',
    '[class.cursor-grab]': 'movable()',
    '[class.is-dragging]': 'dragging.task()?.id === task().id',
    '(dragstart)': 'start($event)',
    '(dragend)': 'dragging.task.set(null)',
  },
})
export class TaskDrag {
  readonly task = input.required<Task>({ alias: 'appTaskDrag' });
  /** True: tasks can't be moved here (someone who may only look). */
  readonly off = input(false, { alias: 'appTaskDragOff' });
  protected readonly dragging = inject(TaskDragging);
  protected readonly movable = computed(() => !this.off() && canReassign(this.task()));

  protected start(event: DragEvent): void {
    if (!this.movable()) {
      event.preventDefault();
      return;
    }
    // Browsers only start a drag when some data is attached; the task itself travels in TaskDragging.
    event.dataTransfer?.setData('text/plain', this.task().title);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
    this.dragging.task.set(this.task());
  }
}

@Directive({
  selector: '[appTaskDrop]',
  host: {
    '[class.drop-ready]': 'accepts()',
    '[class.drop-over]': 'accepts() && over()',
    '(dragover)': 'dragOver($event)',
    '(dragleave)': 'leave($event)',
    '(drop)': 'drop($event)',
  },
})
export class TaskDrop {
  /** Who gets a task dropped here: a student's id, or null for nobody (the Unassigned row). */
  readonly target = input.required<number | null>({ alias: 'appTaskDrop' });
  readonly taskDropped = output<Task>();

  private readonly dragging = inject(TaskDragging);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly over = signal(false);

  /** A task is being dragged, and dropping it here would change who has it. */
  protected readonly accepts = computed(() => {
    const task = this.dragging.task();
    return task !== null && (task.assignee?.id ?? null) !== this.target();
  });

  protected dragOver(event: DragEvent): void {
    if (!this.accepts()) {
      return;
    }
    event.preventDefault(); // this is what tells the browser a drop is allowed here
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.over.set(true);
  }

  /** Moving between things inside the row also fires dragleave: only clear when really leaving it. */
  protected leave(event: DragEvent): void {
    if (!this.host.contains(event.relatedTarget as Node | null)) {
      this.over.set(false);
    }
  }

  protected drop(event: DragEvent): void {
    const task = this.dragging.task();
    this.over.set(false);
    if (!task || !this.accepts()) {
      return;
    }
    event.preventDefault();
    this.dragging.task.set(null);
    this.taskDropped.emit(task);
  }
}
