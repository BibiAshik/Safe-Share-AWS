package com.safeshare.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

@Configuration
public class S3Config {

    @Value("${aws.s3.region}")
    private String region;

    @Bean
    public S3Client s3Client() {
        return S3Client.builder()
                .region(Region.of(region))
                // Note: Credentials are automatically loaded from EnvironmentVariablesCredentialsProvider
                // or InstanceProfileCredentialsProvider (in AWS ECS/EC2)
                .build();
    }
}
