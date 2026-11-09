package com.isandt.backend.activity;

import com.isandt.backend.common.text.Dates;
import java.lang.reflect.RecordComponent;
import java.time.LocalDate;

import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Looks at what a request that changed something answers with, just before it's sent, to fill in
 * its log entry: the name of the thing it acted on (a task's title, a person's name…), or, for an
 * error, the message the person was shown. The response itself is passed on untouched.
 */
@ControllerAdvice
class ActivityTargets implements ResponseBodyAdvice<Object> {

	@Override
	public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
		return true;
	}

	@Override
	public Object beforeBodyWrite(Object body, MethodParameter returnType, MediaType contentType,
			Class<? extends HttpMessageConverter<?>> converterType, ServerHttpRequest request, ServerHttpResponse response) {
		if (request instanceof ServletServerHttpRequest servlet && !"GET".equals(servlet.getServletRequest().getMethod())) {
			HttpServletRequest http = servlet.getServletRequest();
			if (body instanceof ProblemDetail problem) {
				http.setAttribute(ActivityLog.REASON, problem.getDetail());
			}
			else if (http.getAttribute(ActivityLog.TARGET) == null) {
				String name = nameOf(body);
				if (name != null) {
					http.setAttribute(ActivityLog.TARGET, name);
				}
			}
		}
		return body;
	}

	/**
	 * A readable name for a response: its title, name or label; a person's first and last name; a
	 * student's name and the date (time off). Saved results are looked inside. Null if none.
	 */
	static String nameOf(Object body) {
		if (body == null || !body.getClass().isRecord()) {
			return null;
		}
		if (part(body, "result") instanceof Object inner && inner != body && nameOf(inner) instanceof String name) {
			return name;
		}
		for (String field : new String[] { "title", "name", "itemName", "label" }) {
			if (part(body, field) instanceof String text && !text.isBlank()) {
				return text;
			}
		}
		if (part(body, "firstName") instanceof String first) {
			return (first + " " + (part(body, "lastName") instanceof String last ? last : "")).strip();
		}
		if (part(body, "studentName") instanceof String student) {
			return part(body, "date") instanceof LocalDate date ? student + ", " + Dates.day(date) : student;
		}
		return null;
	}

	/** One field of a record, or null if it has none by that name. */
	private static Object part(Object record, String field) {
		for (RecordComponent component : record.getClass().getRecordComponents()) {
			if (component.getName().equals(field)) {
				try {
					component.getAccessor().setAccessible(true);
					return component.getAccessor().invoke(record);
				}
				catch (ReflectiveOperationException | RuntimeException unreadable) {
					return null;
				}
			}
		}
		return null;
	}

}
