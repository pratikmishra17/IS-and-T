package com.isandt.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.function.Predicate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import com.isandt.backend.calendar.HolidayService;
import com.isandt.backend.calendar.SemesterService;
import com.isandt.backend.inventory.CatalogService;
import com.isandt.backend.inventory.ItemService;
import com.isandt.backend.inventory.StockService;
import com.isandt.backend.portal.CalendarFeedService;
import com.isandt.backend.portal.MyPortalService;
import com.isandt.backend.schedule.AdminScheduleService;
import com.isandt.backend.schedule.StudentScheduleService;
import com.isandt.backend.settings.DailyDigest;
import com.isandt.backend.settings.SettingsService;
import com.isandt.backend.task.AdminTaskService;
import com.isandt.backend.task.StudentTaskService;
import com.isandt.backend.timeoff.TimeOffService;
import com.isandt.backend.user.Account;
import com.isandt.backend.user.Accounts;
import com.isandt.backend.user.Admin;
import com.isandt.backend.user.AdminService;
import com.isandt.backend.user.MyAccountService;
import com.isandt.backend.user.Student;
import com.isandt.backend.user.StudentService;

import jakarta.servlet.http.Cookie;

/**
 * Who may call what. Loads every controller with the real SecurityConfig, but with stand-in
 * (mock) services and no database, then checks the security rules endpoint by endpoint.
 * <p>
 * The endpoint list is read from the app itself, so a controller added later is checked
 * automatically: if it isn't protected the way its path says it should be, these tests fail.
 */
@WebMvcTest
@Import({ SecurityConfig.class, LoginThrottle.class })
class SecurityRulesTest {

	private static final Instant NOW = Instant.parse("2026-10-21T15:00:00Z");

	/** The only endpoints anyone may call without logging in. */
	private static final Set<String> PUBLIC = Set.of("POST /api/auth/login", "POST /api/auth/set-password",
			"POST /api/auth/forgot-password", "GET /api/auth/me", "GET /api/calendar/{token}.ics");

	/** A fixed clock, so session ages are exact. */
	@TestConfiguration
	static class FixedClock {

		@Bean
		Clock clock() {
			return Clock.fixed(NOW, ZoneId.of("America/New_York"));
		}

	}

	/** One endpoint: an HTTP method and a path pattern such as /api/admin/students/{id}. */
	record Endpoint(HttpMethod method, String pattern) {

		String key() {
			return method.name() + " " + pattern;
		}

		/** A request to it, with every {variable} in the path filled in with 1. */
		MockHttpServletRequestBuilder request() {
			return MockMvcRequestBuilders.request(method, pattern.replaceAll("\\{[^}]+}", "1"));
		}

		boolean changesData() {
			return method != HttpMethod.GET;
		}

		@Override
		public String toString() {
			return key();
		}

	}

	@Autowired
	private MockMvc mvc;

	@Autowired
	@Qualifier("requestMappingHandlerMapping")
	private RequestMappingHandlerMapping mappings;

	@Autowired
	private PasswordEncoder passwordEncoder;

	@MockitoBean
	private Accounts accounts;

	@MockitoBean
	private SessionPolicy policy;

	@MockitoBean
	private UserDetailsService userDetailsService;

	@MockitoBean
	private AuthService authService;

	@MockitoBean
	private MyAccountService myAccountService;

	@MockitoBean
	private StudentService studentService;

	@MockitoBean
	private AdminService adminService;

	@MockitoBean
	private SemesterService semesterService;

	@MockitoBean
	private HolidayService holidayService;

	@MockitoBean
	private CatalogService catalogService;

	@MockitoBean
	private ItemService itemService;

	@MockitoBean
	private StockService stockService;

	@MockitoBean
	private AdminScheduleService adminScheduleService;

	@MockitoBean
	private StudentScheduleService studentScheduleService;

	@MockitoBean
	private AdminTaskService adminTaskService;

	@MockitoBean
	private StudentTaskService studentTaskService;

	@MockitoBean
	private TimeOffService timeOffService;

	@MockitoBean
	private MyPortalService myPortalService;

	@MockitoBean
	private CalendarFeedService calendarFeedService;

	@MockitoBean
	private SettingsService settingsService;

	@MockitoBean
	private DailyDigest dailyDigest;

	/** The CSRF token, read from the XSRF-TOKEN cookie the way Angular does. */
	private String csrfToken;

	@BeforeEach
	void setUp() throws Exception {
		Cookie cookie = mvc.perform(get("/api/auth/me")).andReturn().getResponse().getCookie("XSRF-TOKEN");
		assertThat(cookie).as("the XSRF-TOKEN cookie").isNotNull();
		csrfToken = cookie.getValue();

		// By default every account is active, on session version 0, and has a password it chose.
		when(accounts.sessionState(any(), any())).thenReturn(Optional.of(new Accounts.SessionState(true, 0, false)));
		when(policy.maxLength()).thenReturn(Duration.ofHours(12));
		when(policy.idleTimeout(any())).thenReturn(Duration.ofMinutes(15));
	}

	// --- Who may call what ---

	@Test
	void everyEndpointExceptThePublicOnesNeedsALogin() throws Exception {
		List<Endpoint> wrong = new ArrayList<>();
		for (Endpoint endpoint : endpoints(e -> !PUBLIC.contains(e.key()))) {
			if (status(endpoint.request().with(csrf())) != 401) {
				wrong.add(endpoint);
			}
		}
		assertThat(wrong).as("endpoints that answer without a login").isEmpty();
	}

	@Test
	void studentsCannotUseAdminEndpoints() throws Exception {
		MockHttpSession student = session(new Student("sam@csuohio.edu", "Sam", "Lee", "2700001", null), NOW);
		List<Endpoint> wrong = new ArrayList<>();
		for (Endpoint endpoint : endpoints(e -> e.pattern().startsWith("/api/admin/"))) {
			if (status(endpoint.request().with(csrf()).session(student)) != 403) {
				wrong.add(endpoint);
			}
		}
		assertThat(wrong).as("admin endpoints a student can use").isEmpty();
	}

	@Test
	void adminsCannotUseStudentEndpoints() throws Exception {
		MockHttpSession admin = adminSession(NOW);
		List<Endpoint> wrong = new ArrayList<>();
		for (Endpoint endpoint : endpoints(e -> e.pattern().startsWith("/api/me/"))) {
			if (status(endpoint.request().with(csrf()).session(admin)) != 403) {
				wrong.add(endpoint);
			}
		}
		assertThat(wrong).as("student endpoints an admin can use").isEmpty();
	}

	@Test
	void changesWithoutTheCsrfTokenAreRefused() throws Exception {
		MockHttpSession admin = adminSession(NOW);
		List<Endpoint> wrong = new ArrayList<>();
		for (Endpoint endpoint : endpoints(e -> e.changesData() && !e.pattern().startsWith("/api/me/"))) {
			if (status(endpoint.request().session(admin)) != 403) {
				wrong.add(endpoint);
			}
		}
		assertThat(wrong).as("endpoints that accept changes without the CSRF token").isEmpty();
	}

	@Test
	void theRightPeopleGetIn() throws Exception {
		assertThat(status(get("/api/admin/students").session(adminSession(NOW)))).isEqualTo(200);
		MockHttpSession student = session(new Student("sam@csuohio.edu", "Sam", "Lee", "2700001", null), NOW);
		assertThat(status(get("/api/me/time-off").session(student))).isEqualTo(200);
	}

	// --- Sessions the server ends (SessionGuardFilter) ---

	@Test
	void aSessionOlderThanTheMaximumLengthIsEnded() throws Exception {
		MockHttpSession oneMinuteTooOld = adminSession(NOW.minus(Duration.ofHours(12)).minusSeconds(60));
		assertThat(status(get("/api/admin/students").session(oneMinuteTooOld))).isEqualTo(401);
		assertThat(oneMinuteTooOld.isInvalid()).isTrue();

		assertThat(status(get("/api/admin/students").session(adminSession(NOW.minus(Duration.ofHours(11))))))
			.isEqualTo(200);
	}

	@Test
	void aPasswordChangeElsewhereEndsTheSession() throws Exception {
		when(accounts.sessionState(any(), any())).thenReturn(Optional.of(new Accounts.SessionState(true, 1, false)));
		MockHttpSession session = adminSession(NOW); // still on version 0
		assertThat(status(get("/api/admin/students").session(session))).isEqualTo(401);
		assertThat(session.isInvalid()).isTrue();
	}

	@Test
	void disablingOrRemovingAnAccountEndsItsSessions() throws Exception {
		when(accounts.sessionState(any(), any())).thenReturn(Optional.of(new Accounts.SessionState(false, 0, false)));
		assertThat(status(get("/api/admin/students").session(adminSession(NOW)))).isEqualTo(401);

		when(accounts.sessionState(any(), any())).thenReturn(Optional.empty());
		assertThat(status(get("/api/admin/students").session(adminSession(NOW)))).isEqualTo(401);
	}

	@Test
	void anAccountThatMustChangeItsPasswordCanOnlyDoThat() throws Exception {
		when(accounts.sessionState(any(), any())).thenReturn(Optional.of(new Accounts.SessionState(true, 0, true)));
		MockHttpSession session = adminSession(NOW);

		MockHttpServletResponse blocked = mvc.perform(get("/api/admin/students").session(session)).andReturn().getResponse();
		assertThat(blocked.getStatus()).isEqualTo(403);
		assertThat(blocked.getContentAsString()).contains("Choose a new password first.");

		assertThat(status(get("/api/auth/me").session(session))).isEqualTo(200);
		assertThat(status(post("/api/account/password").with(csrf()).session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"currentPassword\":\"temporary-pass\",\"newPassword\":\"a-brand-new-password\"}")))
			.as("changing the password").isBetween(200, 299);
	}

	// --- Password guessing ---

	@Test
	void loginIsRefusedAfterFiveWrongPasswords() throws Exception {
		when(userDetailsService.loadUserByUsername(anyString())).thenThrow(new UsernameNotFoundException("no"));
		String body = "{\"email\":\"guess@csuohio.edu\",\"password\":\"wrong-password\",\"portal\":\"STUDENT\"}";
		for (int attempt = 1; attempt <= 5; attempt++) {
			assertThat(status(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body)))
				.isEqualTo(401);
		}
		assertThat(status(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body)))
			.isEqualTo(429);
	}

	@Test
	void eachPortalOnlyLetsInItsOwnRole() throws Exception {
		Admin admin = new Admin("boss@csuohio.edu", "Pat", "Kim", null);
		ReflectionTestUtils.setField(admin, "id", 1L);
		admin.changePasswordHash(passwordEncoder.encode("right-password"));
		// A fresh copy per login, as the real service loads one from the database each time
		// (Spring Security erases the password hash from the copy it used).
		when(userDetailsService.loadUserByUsername("boss@csuohio.edu")).thenAnswer(call -> new AuthenticatedUser(admin));

		MockHttpServletResponse studentPortal = mvc.perform(login("boss@csuohio.edu", "right-password", "STUDENT")).andReturn().getResponse();
		assertThat(studentPortal.getStatus()).isEqualTo(403);
		assertThat(studentPortal.getContentAsString()).contains("Admins log in at the admin portal.");
		assertThat(studentPortal.getCookie("JSESSIONID")).as("no session for the wrong portal").isNull();

		assertThat(mvc.perform(login("boss@csuohio.edu", "right-password", "ADMIN")).andReturn().getResponse().getStatus())
			.isEqualTo(200);
	}

	private MockHttpServletRequestBuilder login(String email, String password, String portal) {
		return post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"password\":\"%s\",\"portal\":\"%s\"}".formatted(email, password, portal));
	}

	// --- Browser protections ---

	@Test
	void responsesCarryTheSecurityHeaders() throws Exception {
		MockHttpServletResponse response = mvc.perform(get("/api/auth/me")).andReturn().getResponse();
		assertThat(response.getHeader("Content-Security-Policy")).isEqualTo("default-src 'none'; frame-ancestors 'none'");
		assertThat(response.getHeader("X-Frame-Options")).isEqualTo("DENY");
		assertThat(response.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
		assertThat(response.getHeader("Referrer-Policy")).isEqualTo("no-referrer");
		assertThat(response.getHeader("Permissions-Policy")).contains("camera=()");
		// The CSRF cookie: readable by Angular (not HttpOnly), and not sent along on other sites' requests
		Cookie xsrf = response.getCookie("XSRF-TOKEN");
		assertThat(xsrf.isHttpOnly()).isFalse();
		assertThat(xsrf.getAttribute("SameSite")).isEqualTo("Lax");
	}

	// --- Helpers ---

	/** Every endpoint the app has (that matches the filter), in a stable order. */
	private List<Endpoint> endpoints(Predicate<Endpoint> filter) {
		List<Endpoint> all = new ArrayList<>();
		mappings.getHandlerMethods().keySet().forEach(info -> {
			Set<RequestMethod> methods = info.getMethodsCondition().getMethods();
			for (String pattern : info.getPatternValues()) {
				if (!pattern.startsWith("/api/")) {
					continue; // Spring Boot's own /error page, which is public on purpose
				}
				if (methods.isEmpty()) {
					all.add(new Endpoint(HttpMethod.GET, pattern));
				}
				methods.forEach(method -> all.add(new Endpoint(HttpMethod.valueOf(method.name()), pattern)));
			}
		});
		assertThat(all).as("the app's endpoints").hasSizeGreaterThan(40);
		return all.stream().filter(filter).sorted(Comparator.comparing(Endpoint::key)).toList();
	}

	/** Sends the CSRF token back as Angular does: the cookie, plus its value in the X-XSRF-TOKEN header. */
	private RequestPostProcessor csrf() {
		return request -> {
			request.setCookies(new Cookie("XSRF-TOKEN", csrfToken));
			request.addHeader("X-XSRF-TOKEN", csrfToken);
			return request;
		};
	}

	private int status(MockHttpServletRequestBuilder request) throws Exception {
		return mvc.perform(request).andReturn().getResponse().getStatus();
	}

	private MockHttpSession adminSession(Instant loginAt) {
		return session(new Admin("boss@csuohio.edu", "Pat", "Kim", null), loginAt);
	}

	/** A session exactly as AuthController.login leaves it: who is logged in, when, and on which version. */
	private MockHttpSession session(Account account, Instant loginAt) {
		ReflectionTestUtils.setField(account, "id", 1L);
		AuthenticatedUser user = new AuthenticatedUser(account);
		MockHttpSession session = new MockHttpSession();
		session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,
				new SecurityContextImpl(UsernamePasswordAuthenticationToken.authenticated(user, null, user.getAuthorities())));
		session.setAttribute(SessionGuardFilter.LOGIN_AT, loginAt);
		session.setAttribute(SessionGuardFilter.VERSION, 0);
		return session;
	}

}
