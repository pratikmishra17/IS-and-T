package com.isandt.backend.activity;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.method.HandlerMethod;

class ActivityRecorderTest {

	private final ActivityLog log = mock(ActivityLog.class);

	private final ActivityRecorder recorder = new ActivityRecorder(log);

	static class Endpoints {

		@Activity("Set a password from an email link")
		void setPassword() {
		}

	}

	@Test
	void anEntryNamesWhoTheRequestWasFor_notWhoeverIsLoggedInOnThatBrowser() throws NoSuchMethodException {
		MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/set-password");
		ActivityEntry.Actor hetvi = new ActivityEntry.Actor("STUDENT", 1L, "Hetvi Shah", "hetvi@isandt.test");
		request.setAttribute(ActivityLog.ACTOR, hetvi);
		HandlerMethod endpoint = new HandlerMethod(new Endpoints(), Endpoints.class.getDeclaredMethod("setPassword"));

		recorder.afterCompletion(request, new MockHttpServletResponse(), endpoint, null);

		verify(log).record(eq(hetvi), eq("Set a password from an email link"), isNull(), eq("POST"),
				eq("/api/auth/set-password"), eq(200), isNull(), any());
		verify(log, never()).record(isNull(com.isandt.backend.auth.AuthenticatedUser.class), any(), any(), any(), any(),
				anyInt(), any(), any());
	}

}
