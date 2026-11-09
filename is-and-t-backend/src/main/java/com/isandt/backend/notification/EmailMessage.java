package com.isandt.backend.notification;

public record EmailMessage(String to, String subject, String body) {
}
