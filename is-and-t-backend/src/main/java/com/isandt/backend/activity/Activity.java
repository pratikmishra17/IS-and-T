package com.isandt.backend.activity;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * How an endpoint reads in the activity log: @Activity("Assigned a task"). Every endpoint that
 * changes something has one (ActivityLabelsTest checks); the log adds who, when, what it was done
 * to, and whether it worked.
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface Activity {

	/** What was done, in the past tense, starting with a capital: "Created a task". */
	String value();

}
