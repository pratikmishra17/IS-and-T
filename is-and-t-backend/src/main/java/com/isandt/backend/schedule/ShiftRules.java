package com.isandt.backend.schedule;

import java.util.List;

import com.isandt.backend.common.error.ConflictException;

/** The hard rules for weekly blocks: these block saving. (Soft rules come back as warnings.) */
final class ShiftRules {

	private ShiftRules() {
	}

	/**
	 * Every block ends after it starts and no two blocks on the same day overlap. Shifts and
	 * preferred hours must also be Monday to Friday; classes may be any day.
	 */
	static void check(List<TimeBlock> blocks, boolean weekdaysOnly, String what) {
		for (TimeBlock block : blocks) {
			if (!block.end().isAfter(block.start())) {
				throw new ConflictException(what + " " + block.describe() + ": the end must be after the start.");
			}
			if (weekdaysOnly && block.isWeekend()) {
				throw new ConflictException(what + " must be Monday to Friday (" + block.describe() + ").");
			}
		}
		for (int i = 0; i < blocks.size(); i++) {
			for (int j = i + 1; j < blocks.size(); j++) {
				if (blocks.get(i).overlaps(blocks.get(j))) {
					throw new ConflictException(what + " " + blocks.get(i).describe() + " and "
							+ blocks.get(j).describe() + " overlap.");
				}
			}
		}
	}

	static double hours(List<TimeBlock> blocks) {
		return blocks.stream().mapToLong(TimeBlock::minutes).sum() / 60.0;
	}

	/** 7.5 → "7.5", 20.0 → "20". */
	static String formatHours(double hours) {
		return hours == Math.rint(hours) ? String.valueOf((long) hours) : String.format("%.1f", hours);
	}

}
