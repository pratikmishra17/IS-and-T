package com.isandt.backend.inventory;

public enum TrackingType {
	/** Just a number per room: "12 keyboards in RT 1408". The only type used for now. */
	COUNT,
	/** Reserved for later: each unit tracked by asset tag and serial number. */
	SERIALIZED
}
