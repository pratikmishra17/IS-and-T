package com.isandt.backend.common.error;

import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.mail.MailException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Turns exceptions thrown by any controller into ProblemDetail JSON responses, so the
 * frontend always gets the same error shape: {"status": 404, "detail": "...", ...}.
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

	@ExceptionHandler(NotFoundException.class)
	ProblemDetail handleNotFound(NotFoundException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
	}

	@ExceptionHandler(ConflictException.class)
	ProblemDetail handleConflict(ConflictException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
	}

	/**
	 * Two people changed the same record at the same moment (for example, two students claimed one
	 * task). The @Version check let the first one through and stopped this one.
	 */
	@ExceptionHandler(ObjectOptimisticLockingFailureException.class)
	ProblemDetail handleSimultaneousChange(ObjectOptimisticLockingFailureException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
				"Someone else changed this at the same moment. Refresh and try again.");
	}

	/**
	 * The email server couldn't be reached or refused the email. The surrounding @Transactional
	 * method rolls back, so nothing was saved (for example, the student wasn't added). The real
	 * cause goes to the log; the user gets a plain explanation.
	 */
	@ExceptionHandler(MailException.class)
	ProblemDetail handleMail(MailException ex) {
		log.error("Sending an email failed", ex);
		return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
				"The email couldn't be sent, so nothing was saved. Please try again; if it keeps failing, check the email settings.");
	}

	/**
	 * Failed login. The message is the same whatever went wrong (unknown email, wrong password,
	 * disabled account), so it can't be used to find out which emails have accounts.
	 */
	@ExceptionHandler(AuthenticationException.class)
	ProblemDetail handleAuthentication(AuthenticationException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "Invalid email or password.");
	}

	/**
	 * Failed @Valid checks on a request body. Adds an "errors" map of field name to message,
	 * so the frontend can show each message next to its form field.
	 */
	@Override
	protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		Map<String, String> errors = new LinkedHashMap<>();
		ex.getBindingResult().getFieldErrors()
				.forEach(error -> errors.putIfAbsent(error.getField(), error.getDefaultMessage()));

		ProblemDetail body = ex.getBody();
		body.setDetail("One or more fields are invalid.");
		body.setProperty("errors", errors);
		return handleExceptionInternal(ex, body, headers, status, request);
	}

}
