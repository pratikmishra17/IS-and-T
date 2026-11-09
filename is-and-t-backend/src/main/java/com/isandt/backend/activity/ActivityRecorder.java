package com.isandt.backend.activity;

import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import com.isandt.backend.auth.AuthenticatedUser;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Writes the activity log. Spring MVC calls afterCompletion once a request has been fully handled
 * (worked or not), so every request that changes something (anything but GET) gets an entry:
 * who was logged in, the endpoint's @Activity label, what it acted on, the HTTP status and, if it
 * failed, why. New endpoints are logged without anyone having to remember to.
 * Reads (GET) aren't logged: looking isn't doing, and it would bury everything else.
 */
@Component
class ActivityRecorder implements HandlerInterceptor, WebMvcConfigurer {

	private static final Logger log = LoggerFactory.getLogger(ActivityRecorder.class);

	private static final Set<String> READS = Set.of("GET", "HEAD", "OPTIONS", "TRACE");

	private final ActivityLog activity;

	ActivityRecorder(ActivityLog activity) {
		this.activity = activity;
	}

	@Override
	public void addInterceptors(InterceptorRegistry registry) {
		registry.addInterceptor(this).addPathPatterns("/api/**");
	}

	@Override
	public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler,
			Exception ex) {
		if (READS.contains(request.getMethod()) || !(handler instanceof HandlerMethod endpoint)) {
			return;
		}
		try {
			Activity label = endpoint.getMethodAnnotation(Activity.class);
			String action = label != null ? label.value() : request.getMethod() + " " + request.getRequestURI();
			// An exception nothing turned into a response is a server error, whatever the status says so far.
			int status = ex != null && response.getStatus() < 400 ? 500 : response.getStatus();
			String reason = (String) request.getAttribute(ActivityLog.REASON);
			if (request.getAttribute(ActivityLog.ACTOR) instanceof ActivityEntry.Actor actingFor) {
				activity.record(actingFor, action, target(request), request.getMethod(), request.getRequestURI(), status, reason,
						request.getRemoteAddr());
			}
			else {
				activity.record(currentUser(), action, target(request), request.getMethod(), request.getRequestURI(), status,
						reason, request.getRemoteAddr());
			}
		}
		catch (RuntimeException problem) {
			// The log must never get in the way of the app.
			log.warn("Couldn't write to the activity log: {}", problem.getMessage());
		}
	}

	/** Who is logged in (after a login, the person who just logged in), or null. */
	private static AuthenticatedUser currentUser() {
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		return authentication != null && authentication.getPrincipal() instanceof AuthenticatedUser user ? user : null;
	}

	/** What the request acted on: a name if one was found, otherwise the id from the address ("#12"). */
	private static String target(HttpServletRequest request) {
		if (request.getAttribute(ActivityLog.TARGET) instanceof String named) {
			return named;
		}
		if (request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE) instanceof Map<?, ?> variables
				&& !variables.isEmpty()) {
			Object id = variables.containsKey("id") ? variables.get("id") : variables.values().iterator().next();
			return "#" + id;
		}
		return null;
	}

}
