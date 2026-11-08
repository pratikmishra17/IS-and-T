package com.isandt.backend.activity;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Every endpoint that changes something reads well in the activity log: it has an @Activity label.
 * (Without one it's still logged, but as "POST /api/…".) A new endpoint without a label fails here.
 */
class ActivityLabelsTest {

	@Test
	void everyEndpointThatChangesSomethingHasAnActivityLabel() throws ClassNotFoundException {
		ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
		scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));
		List<String> unlabelled = new ArrayList<>();
		int writes = 0;
		for (BeanDefinition controller : scanner.findCandidateComponents("com.isandt.backend")) {
			for (Method method : Class.forName(controller.getBeanClassName()).getDeclaredMethods()) {
				boolean changes = method.isAnnotationPresent(PostMapping.class) || method.isAnnotationPresent(PutMapping.class)
						|| method.isAnnotationPresent(DeleteMapping.class) || method.isAnnotationPresent(PatchMapping.class);
				if (changes) {
					writes++;
					Activity label = method.getAnnotation(Activity.class);
					if (label == null || label.value().isBlank()) {
						unlabelled.add(method.getDeclaringClass().getSimpleName() + "." + method.getName());
					}
				}
			}
		}
		assertThat(writes).as("endpoints that change something").isGreaterThan(50);
		assertThat(unlabelled).as("endpoints without an @Activity label").isEmpty();
	}

}
