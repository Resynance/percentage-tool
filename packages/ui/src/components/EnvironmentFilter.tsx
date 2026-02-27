'use client';

import React, { useEffect, useState } from 'react';

export interface EnvironmentFilterProps {
    value: string;
    onChange: (environment: string) => void;
    apiUrl: string; // URL to fetch environments from (e.g., '/api/environments')
    label?: string;
    includeAll?: boolean; // Whether to include "All Environments" option
    disabled?: boolean;
    className?: string;
}

export function EnvironmentFilter({
    value,
    onChange,
    apiUrl,
    label = 'Environment',
    includeAll = false,
    disabled = false,
    className = ''
}: EnvironmentFilterProps) {
    const [environments, setEnvironments] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchEnvironments() {
            try {
                setLoading(true);
                setError(null);
                const response = await fetch(apiUrl);

                if (!response.ok) {
                    throw new Error('Failed to fetch environments');
                }

                const data = await response.json();
                setEnvironments(data.environments || []);
            } catch (err) {
                console.error('Error fetching environments:', err);
                setError('Failed to load environments');
            } finally {
                setLoading(false);
            }
        }

        fetchEnvironments();
    }, [apiUrl]);

    if (loading) {
        return (
            <div className={className}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    {label}
                </label>
                <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500">
                    Loading...
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={className}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    {label}
                </label>
                <div className="w-full px-3 py-2 border border-red-300 rounded-md bg-red-50 text-red-600 text-sm">
                    {error}
                </div>
            </div>
        );
    }

    return (
        <div className={className}>
            <label htmlFor="environment-filter" className="block text-sm font-medium text-gray-700 mb-1">
                {label}
            </label>
            <select
                id="environment-filter"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
                {includeAll && (
                    <option value="">All Environments</option>
                )}
                {environments.length === 0 && !includeAll && (
                    <option value="">No environments found</option>
                )}
                {environments.map((env) => (
                    <option key={env} value={env}>
                        {env}
                    </option>
                ))}
            </select>
        </div>
    );
}
