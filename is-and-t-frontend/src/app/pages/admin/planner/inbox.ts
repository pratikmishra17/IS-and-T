import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { PendingRequest } from '../../../services/schedule';

/**
 * The Planner's Student requests tab, last part: hours students submitted for the semester, to
 * open in the schedule panel and approve. (Time off is with the shift changes, in TeamRequests.)
 */
@Component({
  selector: 'app-planner-inbox',
  imports: [DatePipe],
  templateUrl: './inbox.html',
})
export class PlannerInbox {
  readonly requests = input<PendingRequest[]>([]);
  /** Open a request in the schedule panel to approve it. */
  readonly review = output<PendingRequest>();
}
