from datetime import date

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.projects.models import Project, Task
from apps.users.models import Employee, Role, User


class ProjectTaskApiTests(APITestCase):
    def setUp(self):
        self.admin_role = Role.objects.create(role_name='System Admin')
        self.manager_role = Role.objects.create(
            role_name='Department / Project Manager'
        )
        self.employee_role = Role.objects.create(role_name='Employee')
        self.hr_role = Role.objects.create(role_name='HR Manager')

        self.admin = self.make_user('project-admin', self.admin_role)
        self.manager_user = self.make_user('project-manager', self.manager_role)
        self.employee_user = self.make_user('project-employee', self.employee_role)
        self.other_employee_user = self.make_user(
            'other-employee',
            self.employee_role,
        )
        self.hr_user = self.make_user('project-hr', self.hr_role)

        self.manager = self.make_employee(
            self.manager_user,
            'Pat',
            'Manager',
            'pat.manager@example.com',
        )
        self.employee = self.make_employee(
            self.employee_user,
            'Alex',
            'Employee',
            'alex.employee@example.com',
        )
        self.other_employee = self.make_employee(
            self.other_employee_user,
            'Casey',
            'Employee',
            'casey.employee@example.com',
        )

        self.active_project = self.make_project('Active project')
        self.completed_task_project = self.make_project('Completed task project')
        self.unassigned_project = self.make_project('Other employee project')

        self.active_task = self.make_task(
            self.active_project,
            self.employee,
            Task.Status.TODO,
        )
        self.completed_task = self.make_task(
            self.completed_task_project,
            self.employee,
            Task.Status.DONE,
        )
        self.other_employee_task = self.make_task(
            self.unassigned_project,
            self.other_employee,
            Task.Status.IN_PROGRESS,
        )

    def make_user(self, username, role):
        return User.objects.create_user(
            username=username,
            password='N3w!StrongPassword85',
            role=role,
        )

    def make_employee(self, user, first_name, last_name, email):
        return Employee.objects.create(
            user=user,
            first_name=first_name,
            last_name=last_name,
            email=email,
            hire_date=date(2024, 1, 15),
        )

    def make_project(self, name, start_date=date(2026, 1, 1), end_date=date(2026, 12, 31)):
        return Project.objects.create(
            name=name,
            manager=self.manager,
            start_date=start_date,
            end_date=end_date,
        )

    def make_task(self, project, employee, task_status, deadline=date(2026, 6, 1)):
        return Task.objects.create(
            project=project,
            assigned_to=employee,
            title=f'{project.name} task',
            status=task_status,
            deadline=deadline,
        )

    def project_url(self, project):
        return reverse(
            'project-detail',
            kwargs={'public_id': str(project.public_id)},
        )

    def task_url(self, task):
        return reverse(
            'task-detail',
            kwargs={'public_id': str(task.public_id)},
        )

    def test_employee_sees_only_projects_with_their_non_done_tasks(self):
        self.client.force_authenticate(self.employee_user)

        response = self.client.get(reverse('project-list'))

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            [item['public_id'] for item in response.data],
            [str(self.active_project.public_id)],
        )
        self.assertEqual(
            set(response.data[0]['manager_details']),
            {
                'public_id',
                'first_name',
                'last_name',
                'job_title',
                'role_name',
                'department_name',
            },
        )

    def test_project_manager_and_admin_see_all_projects(self):
        for user in [self.manager_user, self.admin]:
            with self.subTest(role=user.role.role_name):
                self.client.force_authenticate(user)
                response = self.client.get(reverse('project-list'))
                self.assertEqual(
                    response.status_code,
                    status.HTTP_200_OK,
                    response.data,
                )
                self.assertEqual(len(response.data), 3)

    def test_other_roles_do_not_receive_project_lists(self):
        self.client.force_authenticate(self.hr_user)

        response = self.client.get(reverse('project-list'))

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data, [])

    def test_employee_can_patch_own_task_status_only(self):
        self.client.force_authenticate(self.employee_user)

        response = self.client.patch(
            self.task_url(self.active_task),
            {'status': Task.Status.IN_PROGRESS},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.active_task.refresh_from_db()
        self.assertEqual(self.active_task.status, Task.Status.IN_PROGRESS)

        title_response = self.client.patch(
            self.task_url(self.active_task),
            {'title': 'Tampered title'},
            format='json',
        )
        self.assertEqual(
            title_response.status_code,
            status.HTTP_403_FORBIDDEN,
            title_response.data,
        )

        put_response = self.client.put(
            self.task_url(self.active_task),
            {'status': Task.Status.REVIEW},
            format='json',
        )
        self.assertEqual(
            put_response.status_code,
            status.HTTP_403_FORBIDDEN,
            put_response.data,
        )

    def test_employee_cannot_view_or_change_another_employees_task(self):
        self.client.force_authenticate(self.employee_user)
        other_task = self.other_employee_task

        get_response = self.client.get(self.task_url(other_task))
        self.assertEqual(
            get_response.status_code,
            status.HTTP_404_NOT_FOUND,
            get_response.data,
        )

        update_response = self.client.patch(
            self.task_url(other_task),
            {'status': Task.Status.DONE},
            format='json',
        )
        self.assertEqual(
            update_response.status_code,
            status.HTTP_404_NOT_FOUND,
            update_response.data,
        )

        create_response = self.client.post(
            reverse('task-list'),
            {
                'project': str(self.active_project.public_id),
                'assigned_to': str(self.employee.public_id),
                'title': 'Employee-created task',
            },
            format='json',
        )
        self.assertEqual(
            create_response.status_code,
            status.HTTP_403_FORBIDDEN,
            create_response.data,
        )

    def test_project_date_validation_handles_partial_updates(self):
        self.client.force_authenticate(self.manager_user)

        invalid_range = self.client.patch(
            self.project_url(self.active_project),
            {'end_date': '2025-12-31'},
            format='json',
        )
        self.assertEqual(
            invalid_range.status_code,
            status.HTTP_400_BAD_REQUEST,
            invalid_range.data,
        )

        task_deadline = self.active_task.deadline.isoformat()
        invalid_existing_task = self.client.patch(
            self.project_url(self.active_project),
            {'start_date': '2026-07-01'},
            format='json',
        )
        self.assertEqual(
            invalid_existing_task.status_code,
            status.HTTP_400_BAD_REQUEST,
            invalid_existing_task.data,
        )
        self.assertLess(task_deadline, '2026-07-01')

    def test_task_deadline_validation_uses_existing_values_on_patch(self):
        self.client.force_authenticate(self.manager_user)

        response = self.client.patch(
            self.task_url(self.active_task),
            {'deadline': '2027-01-01'},
            format='json',
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
            response.data,
        )

    def test_task_creation_is_available_to_project_managers(self):
        self.client.force_authenticate(self.manager_user)

        response = self.client.post(
            reverse('task-list'),
            {
                'project': str(self.active_project.public_id),
                'assigned_to': str(self.employee.public_id),
                'title': 'Manager-created task',
                'deadline': '2026-08-01',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(
            str(response.data['project']),
            str(self.active_project.public_id),
        )
