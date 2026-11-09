package com.isandt.backend.inventory;

/** itemCount lets the admin portal explain why a category can't be deleted yet. */
public record CategoryResponse(Long id, String name, long itemCount) {
}
