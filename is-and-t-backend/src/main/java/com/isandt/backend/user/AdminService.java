package com.isandt.backend.user;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.isandt.backend.auth.PasswordTokenService;
import com.isandt.backend.auth.TokenPurpose;
import com.isandt.backend.common.error.ConflictException;
import com.isandt.backend.common.error.NotFoundException;

/**
 * What admins do with other admin accounts. No admin can disable or remove themselves, which also
 * guarantees there is always at least one active admin left.
 */
@Service
public class AdminService {

	private final AdminRepository admins;

	private final Accounts accounts;

	private final PasswordTokenService passwordTokens;

	private final AccountEmails emails;

	AdminService(AdminRepository admins, Accounts accounts, PasswordTokenService passwordTokens,
			AccountEmails emails) {
		this.admins = admins;
		this.accounts = accounts;
		this.passwordTokens = passwordTokens;
		this.emails = emails;
	}

	@Transactional(readOnly = true)
	public List<AccountResponse> list() {
		return admins.findAllByOrderByLastNameAscFirstNameAsc().stream().map(AccountResponse::from).toList();
	}

	/** Adds an admin and emails them a link to set their password. */
	@Transactional
	public AccountResponse create(AdminDetails details, Long currentAdminId) {
		accounts.requireEmailFree(details.email());

		Admin admin = admins.save(
				new Admin(details.email(), details.firstName(), details.lastName(), find(currentAdminId)));
		emails.added(admin, passwordTokens.issue(admin, TokenPurpose.SET_PASSWORD));
		return AccountResponse.from(admin);
	}

	@Transactional
	public AccountResponse update(Long id, AdminDetails details) {
		Admin admin = find(id);
		accounts.requireEmailFree(details.email(), admin);
		admin.rename(details.firstName(), details.lastName());
		admin.changeEmail(details.email());
		return AccountResponse.from(admin);
	}

	@Transactional
	public void sendPasswordLink(Long id) {
		Accounts.sendPasswordLink(find(id), passwordTokens, emails);
	}

	@Transactional
	public AccountResponse disable(Long id, Long currentAdminId) {
		Admin admin = findOther(id, currentAdminId);
		if (!admin.isActive()) {
			throw new ConflictException("This account is already disabled.");
		}
		admin.disable();
		return AccountResponse.from(admin);
	}

	@Transactional
	public AccountResponse enable(Long id) {
		Admin admin = find(id);
		admin.enable();
		return AccountResponse.from(admin);
	}

	/**
	 * Deletes the admin for good. Anyone they added keeps their account; "added by" just becomes
	 * empty (ON DELETE SET NULL in the database).
	 */
	@Transactional
	public void remove(Long id, Long currentAdminId) {
		admins.delete(findOther(id, currentAdminId));
	}

	private Admin find(Long id) {
		return admins.findById(id).orElseThrow(() -> new NotFoundException("Admin " + id + " not found."));
	}

	private Admin findOther(Long id, Long currentAdminId) {
		if (id.equals(currentAdminId)) {
			throw new ConflictException("You can't disable or remove your own account.");
		}
		return find(id);
	}

}
